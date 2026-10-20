import { beforeEach, describe, expect, it } from 'vitest';
import {
  TrackerDB,
  addExternalViews,
  addMarks,
  clearAll,
  countBySource,
  deleteBySource,
  deleteVideos,
  exportBackup,
  getStats,
  importWatchmarker,
  markUnwatched,
  restoreBackup,
  saveYtTokens,
  startView,
  takePendingRemovals,
} from './db';
import { cleanTitle } from './browserHistory';
import { normalizeSettings, defaultSettings, pickQuality } from './settings';
import { mergeExports } from './watchmarker';

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const HOUR = 3_600_000;

let db: TrackerDB;
let n = 0;
beforeEach(() => {
  db = new TrackerDB(`marks-${n++}`);
});

describe('addMarks', () => {
  it('adds unknown videos; the progress bar gets an uncertain date', async () => {
    const changed = await addMarks(db, [
      { videoId: A, title: 'A', source: 'youtube-progress', reportedPercent: 40 },
      { videoId: B, title: 'B', source: 'manual' },
    ]);
    expect(changed).toEqual([A, B]);
    const views = await db.views.orderBy('videoId').toArray();
    expect(views.map((v) => [v.videoId, v.kind, v.source, v.dateUncertain, v.reportedPercent])).toEqual([
      [A, 'marked', 'youtube-progress', true, 40],
      [B, 'marked', 'manual', false, undefined],
    ]);
  });

  it('the progress bar never undoes a manual reset, the eye button does', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await markUnwatched(db, [A]);

    expect(await addMarks(db, [{ videoId: A, title: 'A', source: 'youtube-progress' }])).toEqual([]);
    expect((await db.videos.get(A))?.status).toBe('unwatched');

    expect(await addMarks(db, [{ videoId: A, title: 'A', source: 'manual' }])).toEqual([A]);
    expect(await db.videos.get(A)).toMatchObject({ status: 'watched', viewCount: 1 });
  });
});

describe('addExternalViews', () => {
  it('only adds missing videos, once, with their earliest date', async () => {
    await startView(db, { videoId: A, title: 'A', at: 100 * HOUR });
    const r = await addExternalViews(db, 'browser-history', [
      { videoId: A, at: 20 * HOUR }, // known video: left alone, whatever the date
      { videoId: A, at: 300 * HOUR },
      { videoId: B, at: 50 * HOUR, title: 'Video B' },
      { videoId: B, at: 5 * HOUR }, // earlier visit of the same missing video
      { videoId: B, at: 400 * HOUR },
    ]);
    expect(r.added).toBe(1);
    expect(await db.videos.get(A)).toMatchObject({ viewCount: 1, lastViewAt: 100 * HOUR });
    expect(await db.videos.get(B)).toMatchObject({
      title: 'Video B',
      status: 'watched',
      viewCount: 1,
      firstViewAt: 5 * HOUR,
    });
  });

  it('a dated entry wins over an undated one for a missing video', async () => {
    await addExternalViews(db, 'youtube-history', [
      { videoId: B, at: 900 * HOUR, dateUncertain: true },
      { videoId: B, at: 50 * HOUR, dayOnly: true },
    ]);
    const [view] = await db.views.toArray();
    expect(view).toMatchObject({ at: 50 * HOUR, dateUncertain: false, dayOnly: true });
  });

  it('the Watchmarker-vs-YouTube case from real data adds nothing', async () => {
    // Watchmarker took the video over from the YouTube history on 19.10.,
    // YouTube says it was watched on 11.10.
    await startView(db, { videoId: A, title: 'A', at: Date.parse('2026-10-19T07:31:00Z') });
    const r = await addExternalViews(db, 'youtube-history', [
      { videoId: A, at: Date.parse('2026-10-11T11:00:00Z'), dayOnly: true },
    ]);
    expect(r.added).toBe(0);
  });

  it('entries without a date only add unknown videos', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1 * HOUR });
    const r = await addExternalViews(db, 'youtube-history', [
      { videoId: A, at: 500 * HOUR, dateUncertain: true },
      { videoId: B, at: 500 * HOUR, dateUncertain: true },
    ]);
    expect(r.added).toBe(1);
    expect((await db.videos.get(A))?.viewCount).toBe(1);
  });

  it('full sync with replace is idempotent', async () => {
    const items = [{ videoId: A, at: 1 * HOUR }, { videoId: A, at: 30 * HOUR }];
    expect((await addExternalViews(db, 'browser-history', items, { replace: true })).added).toBe(1);
    expect((await addExternalViews(db, 'browser-history', items, { replace: true })).added).toBe(1);
    expect(await db.views.count()).toBe(1);
    expect((await db.videos.get(A))?.viewCount).toBe(1);
  });

  it('a repeated sync adds nothing', async () => {
    const items = [{ videoId: A, at: 1 * HOUR, dayOnly: true }];
    expect((await addExternalViews(db, 'youtube-history', items)).added).toBe(1);
    expect((await addExternalViews(db, 'youtube-history', items)).added).toBe(0);
  });

  it('deleted videos only come back with a view after the deletion', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1 * HOUR });
    await deleteVideos(db, [A]);
    const before = await addExternalViews(db, 'youtube-history', [
      { videoId: A, at: 1 * HOUR },
      { videoId: A, at: 2 * HOUR, dateUncertain: true },
    ]);
    expect(before.added).toBe(0);
    const after = await addExternalViews(db, 'browser-history', [{ videoId: A, at: Date.now() + HOUR }]);
    expect(after.added).toBe(1);
  });

  it('a sync does not undo a manual reset', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await markUnwatched(db, [A]);
    await addExternalViews(db, 'browser-history', [{ videoId: A, at: Date.now() + HOUR }]);
    expect((await db.videos.get(A))?.status).toBe('unwatched');
  });
});

describe('deleting', () => {
  it('the progress bar does not bring back a deleted video, the eye does', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await deleteVideos(db, [A]);
    expect(await addMarks(db, [{ videoId: A, title: 'A', source: 'youtube-progress' }])).toEqual([]);
    expect(await addMarks(db, [{ videoId: A, title: 'A', source: 'manual' }])).toEqual([A]);
    expect(await db.deleted.get(A)).toBeUndefined();
  });

  it('a Watchmarker re-import keeps deleted videos out', async () => {
    const merged = mergeExports([[{ strIdent: A, intTimestamp: 1000, strTitle: 'A', intCount: 1 }]]);
    await importWatchmarker(db, merged);
    await deleteVideos(db, [A]);
    await importWatchmarker(db, merged);
    expect(await db.videos.get(A)).toBeUndefined();
  });

  it('queues the YouTube-history removal, with the token if known', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await startView(db, { videoId: B, title: 'B', at: 1000 });
    await saveYtTokens(db, [{ videoId: A, token: 'tok-a' }]);
    expect(await deleteVideos(db, [A, B], { removeFromYoutube: true })).toBe(2);
    const pending = await takePendingRemovals(db);
    expect(pending.map((p) => [p.videoId, p.token])).toEqual([
      [A, 'tok-a'],
      [B, undefined], // looked up in the YouTube history when removing
    ]);
    expect(await takePendingRemovals(db)).toEqual([]);
    expect(await db.ytTokens.count()).toBe(0);
  });

  it('without the setting nothing is queued', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await saveYtTokens(db, [{ videoId: A, token: 'tok-a' }]);
    expect(await deleteVideos(db, [A])).toBe(0);
    expect(await takePendingRemovals(db)).toEqual([]);
  });

  it('deleteBySource undoes an import without blocking the videos', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1 * HOUR });
    await addExternalViews(db, 'youtube-history', [
      { videoId: A, at: 100 * HOUR, dayOnly: true },
      { videoId: B, at: 100 * HOUR, dayOnly: true },
    ]);
    // A is known, so only the missing B came in.
    expect(await countBySource(db)).toEqual({ extension: 1, 'youtube-history': 1 });

    expect(await deleteBySource(db, 'youtube-history')).toBe(1);
    expect(await db.videos.get(A)).toMatchObject({ viewCount: 1, lastViewAt: 1 * HOUR });
    expect(await db.videos.get(B)).toBeUndefined();
    expect(await db.deleted.count()).toBe(0);
  });
});

describe('stats', () => {
  it('counts videos watched more than once with known dates', async () => {
    await importWatchmarker(
      db,
      mergeExports([[{ strIdent: A, intTimestamp: 1, strTitle: 'A', intCount: 1 }]]),
    );
    await startView(db, { videoId: A, title: 'A', at: 5 * HOUR });
    await startView(db, { videoId: B, title: 'B', at: 5 * HOUR });
    await addMarks(db, [{ videoId: 'ccccccccccc', title: 'C', source: 'youtube-progress' }]);
    expect(await getStats(db)).toMatchObject({ watched: 3, multi: 1, views: 4, uncertainViews: 1 });
  });
});

describe('backup', () => {
  it('restores exactly what was exported, including deleted videos', async () => {
    await startView(db, { videoId: A, title: 'A', at: 1000 });
    await markUnwatched(db, [A]);
    await startView(db, { videoId: B, title: 'B', at: 1000 });
    await deleteVideos(db, [B]);
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    await clearAll(db);
    expect(await db.videos.count()).toBe(0);
    expect(await db.deleted.count()).toBe(0);

    expect(await restoreBackup(db, backup)).toEqual({ videos: 1, views: 1 });
    expect(await db.videos.get(A)).toMatchObject({ status: 'unwatched', viewCount: 1 });
    expect(await db.deleted.get(B)).toBeDefined();
  });

  it('rejects other files', async () => {
    await expect(restoreBackup(db, { foo: 1 })).rejects.toThrow(/backup/);
  });
});

describe('helpers', () => {
  it('cleans browser history titles', () => {
    expect(cleanTitle('(3) Some video - YouTube')).toBe('Some video');
    expect(cleanTitle('YouTube')).toBeUndefined();
    expect(cleanTitle(undefined)).toBeUndefined();
  });

  it('picks the preferred video quality from what is available', () => {
    const available = ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny', 'auto'];
    expect(pickQuality('auto', available)).toBeNull();
    expect(pickQuality('max', available)).toBe('hd1080');
    expect(pickQuality('hd2160', available)).toBe('hd1080'); // not available: next lower
    expect(pickQuality('hd720', available)).toBe('hd720');
    expect(pickQuality('hd720', ['auto'])).toBeNull();
  });

  it('migrates the old single marking switch', () => {
    expect(normalizeSettings(undefined)).toEqual(defaultSettings);
    expect(normalizeSettings({ markWatched: false })).toMatchObject({
      fadeWatched: false,
      grayscaleWatched: false,
      showBadge: false,
      markOnOpen: true,
    });
    expect(normalizeSettings({ markWatched: false })).not.toHaveProperty('markWatched');
  });

  it('migrates the old single ⊘ switch to the three new ones', () => {
    expect(normalizeSettings({ showDismissButton: false })).toMatchObject({
      dismissVideos: false,
      dismissPlaylists: false,
      dismissChannels: false,
    });
    expect(normalizeSettings({ showDismissButton: true })).toMatchObject({ dismissVideos: true });
    expect(normalizeSettings({ showDismissButton: false })).not.toHaveProperty('showDismissButton');
  });
});
