import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TrackerDB,
  deleteVideos,
  deleteView,
  getStats,
  importWatchmarker,
  markUnwatched,
  startView,
  updateVideoMeta,
  updateView,
} from './db';
import { mergeExports, type WatchmarkerEntry } from './watchmarker';

const t = (iso: string) => Date.parse(iso);
const entry = (id: string, iso: string): WatchmarkerEntry => ({
  strIdent: id,
  intTimestamp: t(iso),
  strTitle: `Video ${id}`,
  intCount: 1,
});
const A = 'aaaaaaaaaaa';

let db: TrackerDB;
let n = 0;
beforeEach(() => {
  db = new TrackerDB(`test-${n++}`);
});

describe('importWatchmarker', () => {
  it('stores one view per timestamp and aggregates per video', async () => {
    const merged = mergeExports([
      [entry(A, '2024-10-01T10:00:00Z')],
      [entry(A, '2025-03-01T10:00:00Z'), entry('bbbbbbbbbbb', '2025-03-02T10:00:00Z')],
    ]);
    const summary = await importWatchmarker(db, merged);

    expect(summary).toMatchObject({ videos: 2, views: 3, uncertainViews: 0 });
    expect(await db.videos.get(A)).toMatchObject({
      status: 'watched',
      viewCount: 2,
      firstViewAt: t('2024-10-01T10:00:00Z'),
      lastViewAt: t('2025-03-01T10:00:00Z'),
    });
  });

  it('is idempotent and keeps views and metadata recorded by the extension', async () => {
    const merged = mergeExports([[entry(A, '2024-10-01T10:00:00Z')]]);
    await importWatchmarker(db, merged);
    await startView(db, { videoId: A, title: 'Current title', at: t('2026-01-01T10:00:00Z') });
    await updateVideoMeta(db, A, { channelName: 'Some Channel', durationSec: 600 });
    await importWatchmarker(db, merged);

    expect(await db.views.count()).toBe(2);
    expect(await db.videos.get(A)).toMatchObject({
      title: 'Current title',
      channelName: 'Some Channel',
      durationSec: 600,
      viewCount: 2,
      lastViewAt: t('2026-01-01T10:00:00Z'),
    });
  });

  it('keeps a manual reset across re-imports', async () => {
    const merged = mergeExports([[entry(A, '2024-10-01T10:00:00Z')]]);
    await importWatchmarker(db, merged);
    await markUnwatched(db, [A]);
    await importWatchmarker(db, merged);
    expect((await db.videos.get(A))?.status).toBe('unwatched');
  });
});

describe('views', () => {
  it('a new view after a reset marks the video as watched again', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await markUnwatched(db, [A]);
    expect((await db.videos.get(A))?.status).toBe('unwatched');

    await startView(db, { videoId: A, title: 'A', at: Date.now() + 1000 });
    expect(await db.videos.get(A)).toMatchObject({ status: 'watched', viewCount: 2, firstViewAt: 1000 });
  });

  it('stores session context and progress', async () => {
    const { viewId } = await startView(db, {
      videoId: A,
      title: 'A',
      entry: 'subscriptions',
      playlistId: 'PL123',
      playlistIndex: 4,
    });
    await updateView(db, viewId, { maxPosition: 590.4, watchedSeconds: 401.7, durationSec: 600, finishedAt: 5 });
    expect(await db.views.get(viewId)).toMatchObject({
      kind: 'watch',
      entry: 'subscriptions',
      playlistId: 'PL123',
      playlistIndex: 4,
      maxPosition: 590,
      watchedSeconds: 402,
      durationSec: 600,
      finishedAt: 5,
    });
  });

  it('deleteView updates the video and removes it with its last view', async () => {
    const first = await startView(db, { videoId: A, title: 'A', at: 1000 });
    const second = await startView(db, { videoId: A, title: 'A', at: 2000 });

    const after = await deleteView(db, second.viewId);
    expect(after).toMatchObject({ viewCount: 1, lastViewAt: 1000 });

    expect(await deleteView(db, first.viewId)).toBeNull();
    expect(await db.videos.get(A)).toBeUndefined();
  });

  it('deleteVideos removes videos and their history', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await startView(db, { videoId: 'bbbbbbbbbbb', title: 'B', at: 1000 });
    await deleteVideos(db, [A, 'bbbbbbbbbbb']);
    expect(await getStats(db)).toEqual({ watched: 0, multi: 0, reset: 0, views: 0, uncertainViews: 0 });
  });

  it('updateVideoMeta ignores empty values', async () => {
    await startView(db, { videoId: A, title: 'A' });
    await updateVideoMeta(db, A, { channelName: 'C', category: '', channelId: undefined });
    const v = await db.videos.get(A);
    expect(v?.channelName).toBe('C');
    expect(v).not.toHaveProperty('category');
    expect(v?.metaUpdatedAt).toBeTypeOf('number');
  });
});

describe('schema upgrade v1 → v2', () => {
  it('turns opened/finished rows into watch sessions', async () => {
    const name = `upgrade-${n++}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ videos: 'id, status, lastViewAt', views: '++id, videoId, at, source' });
    await v1.table('views').bulkAdd([
      { videoId: A, at: 1, kind: 'opened', source: 'extension', dateUncertain: false },
      { videoId: A, at: 2, kind: 'finished', source: 'extension', dateUncertain: false },
      { videoId: A, at: 0, kind: 'imported', source: 'watchmarker', dateUncertain: true },
    ]);
    v1.close();

    const views = await new TrackerDB(name).views.orderBy('at').toArray();
    expect(views.map((v) => [v.kind, v.finishedAt])).toEqual([
      ['imported', undefined],
      ['watch', undefined],
      ['watch', 2],
    ]);
  });
});
