import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TrackerDB,
  addExternalViews,
  deleteVideos,
  importTakeout,
  importWatchmarker,
  markUnwatched,
  recordMusicPlay,
  startView,
} from './db';
import { parseTakeout, stripWatched, type TakeoutEntry } from './takeout';
import { mergeExports, type WatchmarkerEntry } from './watchmarker';

const t = (iso: string) => Date.parse(iso);
const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const C = 'ccccccccccc';
const MIN = 60 * 1000;

const entry = (videoId: string, iso: string, music = false): TakeoutEntry => ({
  videoId,
  title: `Video ${videoId}`,
  at: t(iso),
  music,
});

const wm = (id: string, iso: string): WatchmarkerEntry => ({
  strIdent: id,
  intTimestamp: t(iso),
  strTitle: `WM ${id}`,
  intCount: 1,
});

/** Watchmarker import with `bulk` entries on one day, so that day counts as a bulk import. */
function watchmarkerWithBulkDay(entries: WatchmarkerEntry[], bulkIso: string, bulkIds: string[]) {
  const filler = Array.from({ length: 500 }, (_, i) => wm(`x${String(i).padStart(10, '0')}`, bulkIso));
  return mergeExports([[...entries, ...bulkIds.map((id) => wm(id, bulkIso)), ...filler]]);
}

const viewsOf = async (db: TrackerDB, id: string) =>
  (await db.views.where('videoId').equals(id).sortBy('at')).map((v) => [v.source, new Date(v.at).toISOString()]);

let db: TrackerDB;
let n = 0;
beforeEach(() => {
  db = new TrackerDB(`takeout-${n++}`);
});

describe('parseTakeout', () => {
  it('reads videos, music, channels and skips ads and entries without a video', () => {
    const json = JSON.stringify([
      {
        header: 'YouTube',
        title: 'Watched Some video',
        titleUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        subtitles: [{ name: 'Some Channel', url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv' }],
        time: '2024-05-01T12:00:00.123Z',
        products: ['YouTube'],
      },
      {
        header: 'YouTube Music',
        title: 'Song angesehen',
        titleUrl: 'https://music.youtube.com/watch?v=bbbbbbbbbbb',
        time: '2024-05-02T12:00:00Z',
      },
      {
        header: 'YouTube',
        title: 'Watched Ad',
        titleUrl: 'https://www.youtube.com/watch?v=ccccccccccc',
        time: '2024-05-03T12:00:00Z',
        details: [{ name: 'From Google Ads' }],
      },
      { header: 'YouTube', title: 'Watched a video that has been removed', time: '2024-05-04T12:00:00Z' },
    ]);
    const r = parseTakeout(json);
    expect(r.ads).toBe(1);
    expect(r.noVideo).toBe(1);
    expect(r.entries).toEqual([
      {
        videoId: A,
        title: 'Some video',
        at: t('2024-05-01T12:00:00.123Z'),
        music: false,
        channelId: 'UCabcdefghijklmnopqrstuv',
        channelName: 'Some Channel',
      },
      { videoId: B, title: 'Song', at: t('2024-05-02T12:00:00Z'), music: true, channelId: undefined, channelName: undefined },
    ]);
  });

  it('explains the HTML variant', () => {
    expect(() => parseTakeout('<html><body></body></html>')).toThrow(/JSON/);
  });

  it('strips the "watched" wording', () => {
    expect(stripWatched('Watched Foo')).toBe('Foo');
    expect(stripWatched('Foo angesehen')).toBe('Foo');
    expect(stripWatched('Foo')).toBe('Foo');
  });
});

describe('recordMusicPlay', () => {
  it('adds one view per play and flags the video as music', async () => {
    await recordMusicPlay(db, { videoId: A, title: 'Song', channelName: 'Artist', at: t('2026-01-01T10:00:00Z') });
    await recordMusicPlay(db, { videoId: A, title: 'Song', at: t('2026-01-01T10:04:00Z') });
    expect(await db.videos.get(A)).toMatchObject({ isMusic: true, viewCount: 2, title: 'Song', channelName: 'Artist' });
    expect((await db.views.toArray()).map((v) => v.source)).toEqual(['youtube-music', 'youtube-music']);
  });

  it('lifts a deletion like any new view', async () => {
    await recordMusicPlay(db, { videoId: A, title: 'Song' });
    await deleteVideos(db, [A]);
    await recordMusicPlay(db, { videoId: A, title: 'Song' });
    expect(await db.deleted.get(A)).toBeUndefined();
    expect((await db.videos.get(A))!.viewCount).toBe(1);
  });
});

describe('importTakeout', () => {
  it('adds every watch including rewatches and is idempotent', async () => {
    const items = [entry(A, '2024-01-01T10:00:00Z'), entry(A, '2024-02-01T10:00:00Z'), entry(B, '2024-01-05T10:00:00Z')];
    const s = await importTakeout(db, items);
    expect(s).toMatchObject({ added: 3, known: 0, newVideos: 2, dated: 0 });
    await importTakeout(db, items);
    expect(await db.views.count()).toBe(3);
    expect(await db.videos.get(A)).toMatchObject({ viewCount: 2, title: `Video ${A}` });
  });

  it('skips watches already recorded within an hour, one to one', async () => {
    await startView(db, { videoId: A, title: 'Recorded', at: t('2024-01-01T10:00:00Z') });
    const s = await importTakeout(db, [
      entry(A, '2024-01-01T10:00:05Z'), // same watch
      entry(A, '2024-01-01T10:20:00Z'), // a second watch in the same hour
    ]);
    expect(s).toMatchObject({ added: 1, known: 1, newVideos: 0 });
    expect(await viewsOf(db, A)).toEqual([
      ['extension', '2024-01-01T10:00:00.000Z'],
      ['takeout', '2024-01-01T10:20:00.000Z'],
    ]);
    // The recorded title stays.
    expect((await db.videos.get(A))!.title).toBe('Recorded');
  });

  it('replaces undated bulk-import views, whatever is imported first', async () => {
    const merged = watchmarkerWithBulkDay([wm(B, '2023-03-01T10:00:00Z')], '2024-06-01T10:00:00Z', [A, C]);
    const takeout = [entry(A, '2015-04-01T18:00:00Z'), entry(B, '2023-03-01T10:10:00Z')];

    await importWatchmarker(db, merged);
    const s = await importTakeout(db, takeout);
    expect(s).toMatchObject({ added: 1, known: 1, dated: 1 });
    const first = [await viewsOf(db, A), await viewsOf(db, B), await viewsOf(db, C)];
    expect(first).toEqual([
      [['takeout', '2015-04-01T18:00:00.000Z']],
      [['watchmarker', '2023-03-01T10:00:00.000Z']],
      [['watchmarker', '2024-06-01T10:00:00.000Z']], // not in the Takeout: stays undated
    ]);

    const other = new TrackerDB(`takeout-${n++}`);
    await importTakeout(other, takeout);
    await importWatchmarker(other, merged);
    expect(await viewsOf(other, A)).toEqual(first[0]);
    expect(await viewsOf(other, B)).toEqual([['takeout', '2023-03-01T10:10:00.000Z']]);
    expect(await viewsOf(other, C)).toEqual(first[2]);
    expect((await db.videos.get(A))!.firstViewAt).toBe(t('2015-04-01T18:00:00Z'));
  });

  it('replaces day-only views from the history sync', async () => {
    await addExternalViews(db, 'youtube-history', [{ videoId: A, at: t('2024-01-01T00:00:00Z'), dayOnly: true }]);
    const s = await importTakeout(db, [entry(A, '2024-01-01T21:30:00Z')]);
    expect(s).toMatchObject({ added: 1, dated: 1 });
    expect(await viewsOf(db, A)).toEqual([['takeout', '2024-01-01T21:30:00.000Z']]);
    // A later sync does not bring the day-only view back.
    await addExternalViews(db, 'youtube-history', [{ videoId: A, at: t('2024-01-01T00:00:00Z'), dayOnly: true }], {
      replace: true,
    });
    expect(await db.views.count()).toBe(1);
  });

  it('keeps deleted videos deleted unless watched again afterwards', async () => {
    await startView(db, { videoId: A, title: 'A', at: t('2020-01-01T10:00:00Z') });
    await deleteVideos(db, [A]);
    const later = Date.now() + 60 * MIN;
    const s = await importTakeout(db, [entry(A, '2020-01-01T10:00:00Z'), { ...entry(A, '2020-01-01T10:00:00Z'), at: later }]);
    expect(s).toMatchObject({ added: 1, deleted: 1 });
    expect((await db.views.where('videoId').equals(A).first())!.at).toBe(later);
  });

  it('marks music, fills in the channel and keeps resets', async () => {
    await startView(db, { videoId: A, title: 'A', at: t('2024-01-01T10:00:00Z') });
    await markUnwatched(db, [A]);
    await importTakeout(db, [
      { ...entry(A, '2024-01-01T10:00:00Z', true), channelId: 'UCabcdefghijklmnopqrstuv', channelName: 'Artist - Topic' },
      entry(B, '2023-01-01T10:00:00Z', true),
      entry(C, '2023-01-01T11:00:00Z'),
    ]);
    // A got no new view but is flagged as music; the reset stays (no watch after it).
    expect(await db.videos.get(A)).toMatchObject({ isMusic: true, status: 'unwatched' });
    expect(await db.videos.get(B)).toMatchObject({ isMusic: true });
    expect((await db.videos.get(C))!.isMusic).toBeUndefined();
  });
});
