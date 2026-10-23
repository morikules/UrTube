import Dexie, { type Table } from 'dexie';
import { t } from './i18n';
import type { PlaylistInfo } from './playlists';
import type { TakeoutEntry } from './takeout';
import { dayKey, type MergeResult } from './watchmarker';

/**
 * 'watch' = viewing session recorded by the extension,
 * 'marked' = marked without watching here (eye button, YouTube progress bar),
 * 'imported' = taken over from another record (Watchmarker, browser/YouTube history).
 */
export type ViewKind = 'watch' | 'marked' | 'imported';
export type ViewSource =
  | 'extension'
  | 'manual'
  | 'youtube-progress'
  | 'browser-history'
  | 'youtube-history'
  | 'watchmarker'
  | 'takeout'
  /** Played on music.youtube.com (recorded, never hidden there). */
  | 'youtube-music';

export type VideoStatus = 'watched' | 'unwatched';

/** Page the user came from when opening a video. */
export type EntryPoint =
  | 'home'
  | 'subscriptions'
  | 'search'
  | 'channel'
  | 'watch'
  | 'shorts'
  | 'playlist'
  | 'history'
  | 'other'
  | 'external'
  | 'direct';

/** Video details read from the YouTube player (latest known values). */
export interface VideoMeta {
  channelId?: string;
  channelName?: string;
  /** e.g. "@somechannel" */
  channelHandle?: string;
  durationSec?: number;
  /** As delivered by YouTube, e.g. "2024-05-01T05:00:00-07:00". */
  publishedAt?: string;
  isShort?: boolean;
  isLive?: boolean;
  category?: string;
}

export interface Video extends VideoMeta {
  id: string;
  title: string;
  /** 'unwatched' = user reset it; history is kept, the video shows as new. */
  status: VideoStatus;
  firstViewAt: number;
  lastViewAt: number;
  /** Number of rows in `views` for this video. */
  viewCount: number;
  watchmarkerCount?: number;
  /** Played in YouTube Music (known from the Takeout import). */
  isMusic?: boolean;
  resetAt?: number;
  metaUpdatedAt?: number;
  /** YouTube had no details when asked (deleted or private video). */
  metaTriedAt?: number;
}

export interface View {
  id?: number;
  videoId: string;
  /** Start of the view. */
  at: number;
  kind: ViewKind;
  source: ViewSource;
  /** Timestamp is not the real watch time (bulk import day). */
  dateUncertain: boolean;
  // Only for kind 'watch':
  finishedAt?: number;
  /** Furthest playback position reached, in seconds. */
  maxPosition?: number;
  /** Position when the view was last saved: where YouTube resumes (since 1.0.2). */
  lastPosition?: number;
  /** Seconds of video actually played (without skipped parts and ads). */
  watchedSeconds?: number;
  durationSec?: number;
  isShort?: boolean;
  playlistId?: string;
  playlistIndex?: number;
  entry?: EntryPoint;
  /** Progress shown by YouTube's red bar (0–100) when the view was taken from it. */
  reportedPercent?: number;
  /** Only the day is known, not the time (YouTube history). */
  dayOnly?: boolean;
  /** When this row was written (not set for rows from before v0.3). */
  createdAt?: number;
}

export type ViewProgress = Pick<
  View,
  'maxPosition' | 'lastPosition' | 'watchedSeconds' | 'durationSec' | 'finishedAt'
>;

/** A deleted video; automatic sources must not bring back what was deleted. */
export interface Tombstone {
  id: string;
  deletedAt: number;
}

/** YouTube's token to remove a video from the user's YouTube watch history. */
export interface YtToken {
  videoId: string;
  token: string;
  seenAt: number;
}

/**
 * A video or playlist hidden on YouTube without counting as watched
 * ("Ausblenden"). Not part of the watch history.
 */
export interface Dismissed {
  /** Video ID, playlist ID or channel key ("@handle" / "UC…"). */
  id: string;
  kind: 'video' | 'playlist' | 'channel';
  title?: string;
  /** Channel of a hidden video or playlist ("@handle" / "UC…"), as far as the card showed it. */
  channelKey?: string;
  channelName?: string;
  at: number;
}

/** A video to remove from the YouTube watch history; the token is looked up if unknown. */
export interface PendingRemoval {
  videoId: string;
  token?: string;
  queuedAt: number;
  attempts?: number;
}

export class TrackerDB extends Dexie {
  videos!: Table<Video, string>;
  views!: Table<View, number>;
  deleted!: Table<Tombstone, string>;
  ytTokens!: Table<YtToken, string>;
  /** Removals from the YouTube history waiting for an open YouTube tab. */
  pendingRemovals!: Table<PendingRemoval, string>;
  /** Cached playlist contents (re-read after PLAYLIST_MAX_AGE_MS). */
  playlists!: Table<PlaylistInfo, string>;
  dismissed!: Table<Dismissed, string>;

  // The database keeps its pre-1.0 name: renaming it would lose existing data.
  constructor(name = 'youtube-tracker') {
    super(name);
    this.version(1).stores({
      videos: 'id, status, lastViewAt',
      views: '++id, videoId, at, source',
    });
    this.version(2)
      .stores({
        videos: 'id, status, lastViewAt, channelId',
        views: '++id, videoId, at, source',
      })
      .upgrade(async (tx) => {
        // v1 stored 'opened' and 'finished' as separate rows; both become sessions.
        await tx
          .table('views')
          .where('source')
          .equals('extension')
          .modify((v: Omit<View, 'kind'> & { kind: string }) => {
            if (v.kind === 'finished') v.finishedAt = v.at;
            v.kind = 'watch';
          });
      });
    this.version(3).stores({
      deleted: 'id',
      ytTokens: 'videoId',
      pendingRemovals: 'videoId',
    });
    this.version(4).stores({
      playlists: 'id',
      dismissed: 'id',
    });
  }
}

export async function setDismissed(db: TrackerDB, item: Omit<Dismissed, 'at'>, dismissed: boolean): Promise<void> {
  if (dismissed) await db.dismissed.put({ ...item, at: Date.now() });
  else await db.dismissed.delete(item.id);
}

async function tombstones(db: TrackerDB, ids: string[]): Promise<Map<string, number>> {
  const rows = await db.deleted.bulkGet(ids);
  return new Map(rows.filter((r) => r !== undefined).map((r) => [r!.id, r!.deletedAt]));
}

export interface ImportSummary {
  videos: number;
  views: number;
  uncertainViews: number;
  bulkDays: string[];
}

/** Two views of the same video at most this far apart are the same watch. */
export const SAME_VIEW_MS = 60 * 60 * 1000;

/** The date is not the real watch time (bulk import day, day only, progress bar). */
function isImprecise(v: View): boolean {
  return (v.dateUncertain || !!v.dayOnly) && v.source !== 'extension' && v.source !== 'manual';
}

/**
 * Pairs each time with at most one known time within SAME_VIEW_MS (the nearest
 * free one) and returns the times without a partner: the watches not known yet.
 */
export function unmatchedTimes(times: number[], known: number[]): number[] {
  const used = new Set<number>();
  const rest: number[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    let best = -1;
    for (let i = 0; i < known.length; i++) {
      const d = Math.abs(known[i]! - t);
      if (used.has(i) || d > SAME_VIEW_MS) continue;
      if (best < 0 || d < Math.abs(known[best]! - t)) best = i;
    }
    if (best >= 0) used.add(best);
    else rest.push(t);
  }
  return rest;
}

function timesByVideo(views: View[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const v of views) {
    const list = map.get(v.videoId);
    if (list) list.push(v.at);
    else map.set(v.videoId, [v.at]);
  }
  return map;
}

/**
 * Replaces all previously imported Watchmarker views with the merged result.
 * Idempotent: running it again with the same files gives the same state.
 * Views recorded by the extension, metadata and manual resets are kept;
 * deleted videos stay deleted. Watches already known from the Takeout import
 * are not added again, and videos with Takeout views get no undated views.
 */
export async function importWatchmarker(
  db: TrackerDB,
  merged: MergeResult,
): Promise<ImportSummary> {
  const deleted = new Map((await db.deleted.toArray()).map((t) => [t.id, t.deletedAt]));
  const takeout = timesByVideo(await db.views.where('source').equals('takeout').toArray());
  const createdAt = Date.now();
  const views: View[] = [];
  for (const v of merged.videos) {
    const deletedAt = deleted.get(v.id);
    const known = takeout.get(v.id);
    let times = v.timestamps;
    if (known) {
      times = unmatchedTimes(
        times.filter((at) => !merged.bulkDays.has(dayKey(at))),
        known,
      );
    }
    for (const at of times) {
      if (deletedAt !== undefined && at <= deletedAt) continue;
      views.push({
        videoId: v.id,
        at,
        kind: 'imported',
        source: 'watchmarker',
        dateUncertain: merged.bulkDays.has(dayKey(at)),
        createdAt,
      });
    }
  }

  await db.transaction('rw', db.videos, db.views, async () => {
    await db.views.where('source').equals('watchmarker').delete();
    await db.views.bulkAdd(views);

    const existing = new Map((await db.videos.toArray()).map((v) => [v.id, v]));
    const imported = new Map(merged.videos.map((v) => [v.id, v]));
    const ids = new Set([...existing.keys(), ...imported.keys()]);
    await rebuildVideos(db, ids, existing, (id) => {
      const m = imported.get(id);
      return m ? { title: m.title, watchmarkerCount: m.watchmarkerCount } : {};
    });
  });

  return {
    videos: new Set(views.map((v) => v.videoId)).size,
    views: views.length,
    uncertainViews: views.filter((v) => v.dateUncertain).length,
    bulkDays: [...merged.bulkDays].sort(),
  };
}

/**
 * Recomputes aggregate fields of `videos` from `views`.
 * Videos without any remaining view are deleted.
 */
async function rebuildVideos(
  db: TrackerDB,
  ids: Set<string>,
  existing: Map<string, Video>,
  extra: (id: string) => Partial<Video> = () => ({}),
): Promise<void> {
  const rows =
    ids.size <= 1000
      ? await db.views.where('videoId').anyOf([...ids]).toArray()
      : await db.views.toArray();

  const agg = new Map<string, { first: number; last: number; n: number }>();
  for (const v of rows) {
    if (!ids.has(v.videoId)) continue;
    const a = agg.get(v.videoId);
    if (!a) agg.set(v.videoId, { first: v.at, last: v.at, n: 1 });
    else {
      a.first = Math.min(a.first, v.at);
      a.last = Math.max(a.last, v.at);
      a.n++;
    }
  }

  const put: Video[] = [];
  const remove: string[] = [];
  for (const id of ids) {
    const a = agg.get(id);
    if (!a) {
      remove.push(id);
      continue;
    }
    const old = existing.get(id);
    const x = extra(id);
    const video: Video = {
      ...old,
      id,
      title: old?.title || x.title || '',
      status: old?.status ?? 'watched',
      firstViewAt: a.first,
      lastViewAt: a.last,
      viewCount: a.n,
      watchmarkerCount: x.watchmarkerCount ?? old?.watchmarkerCount,
    };
    // Prefer the title recorded by the extension; Watchmarker's may be outdated.
    if (x.title && !old?.metaUpdatedAt) video.title = x.title;
    if (x.isShort) video.isShort = true;
    if (x.isMusic) video.isMusic = true;
    if (!video.channelId && x.channelId) video.channelId = x.channelId;
    if (!video.channelName && x.channelName) video.channelName = x.channelName;
    // A reset only sticks until the video is watched again afterwards.
    if (video.status === 'unwatched' && video.resetAt && a.last > video.resetAt) {
      video.status = 'watched';
    }
    put.push(video);
  }
  await db.videos.bulkPut(put);
  await db.videos.bulkDelete(remove);
}

export interface StartView {
  videoId: string;
  title: string;
  entry?: EntryPoint;
  isShort?: boolean;
  playlistId?: string;
  playlistIndex?: number;
  at?: number;
}

/** Starts a viewing session; progress is added later with `updateView`. */
export async function startView(
  db: TrackerDB,
  s: StartView,
): Promise<{ viewId: number; video: Video }> {
  const at = s.at ?? Date.now();
  return db.transaction('rw', db.videos, db.views, async () => {
    const viewId = await db.views.add({
      videoId: s.videoId,
      at,
      kind: 'watch',
      source: 'extension',
      dateUncertain: false,
      entry: s.entry,
      isShort: s.isShort,
      playlistId: s.playlistId,
      playlistIndex: s.playlistIndex,
      createdAt: Date.now(),
    });
    const old = await db.videos.get(s.videoId);
    const video: Video = old
      ? {
          ...old,
          title: s.title || old.title,
          status: 'watched',
          lastViewAt: Math.max(old.lastViewAt, at),
          viewCount: old.viewCount + 1,
        }
      : {
          id: s.videoId,
          title: s.title,
          status: 'watched',
          firstViewAt: at,
          lastViewAt: at,
          viewCount: 1,
        };
    if (s.isShort !== undefined) video.isShort = s.isShort;
    await db.videos.put(video);
    return { viewId, video };
  });
}

export interface MusicPlay {
  videoId: string;
  title: string;
  channelName?: string;
  durationSec?: number;
  at?: number;
}

/**
 * Records a track played on music.youtube.com: one view per play, the video is
 * flagged as music. A reset or deletion is lifted, as with any new view.
 */
export async function recordMusicPlay(db: TrackerDB, p: MusicPlay): Promise<Video> {
  const at = p.at ?? Date.now();
  return db.transaction('rw', db.videos, db.views, db.deleted, async () => {
    await db.views.add({
      videoId: p.videoId,
      at,
      kind: 'watch',
      source: 'youtube-music',
      dateUncertain: false,
      durationSec: p.durationSec,
      createdAt: Date.now(),
    });
    await db.deleted.delete(p.videoId);
    const old = await db.videos.get(p.videoId);
    const video: Video = old
      ? { ...old, status: 'watched', lastViewAt: Math.max(old.lastViewAt, at), viewCount: old.viewCount + 1 }
      : { id: p.videoId, title: p.title, status: 'watched', firstViewAt: at, lastViewAt: at, viewCount: 1 };
    video.isMusic = true;
    if (!video.title) video.title = p.title;
    if (!video.channelName && p.channelName) video.channelName = p.channelName;
    if (!video.durationSec && p.durationSec) video.durationSec = p.durationSec;
    await db.videos.put(video);
    return video;
  });
}

export async function updateView(db: TrackerDB, viewId: number, p: ViewProgress): Promise<void> {
  const patch: ViewProgress = {};
  for (const k of ['maxPosition', 'lastPosition', 'watchedSeconds', 'durationSec', 'finishedAt'] as const) {
    if (p[k] !== undefined) patch[k] = k === 'finishedAt' ? p[k] : Math.round(p[k]!);
  }
  await db.views.update(viewId, patch);
}

/**
 * The view a new playback of the video may continue: the latest one recorded
 * here, if it was not watched to the end and the video was not reset since.
 * Whether it really continues depends on where playback starts (see the
 * content script); no time limit, videos often stay open for days.
 */
export async function resumableView(db: TrackerDB, videoId: string): Promise<View | null> {
  const views = await db.views.where('videoId').equals(videoId).toArray();
  let latest: View | undefined;
  for (const v of views) {
    if (v.source === 'extension' && v.kind === 'watch' && (!latest || v.at > latest.at)) latest = v;
  }
  if (!latest || latest.finishedAt || latest.isShort) return null;
  const video = await db.videos.get(videoId);
  if (!video || video.status !== 'watched' || (video.resetAt ?? 0) > latest.at) return null;
  return latest;
}

/**
 * Repair for views recorded before 1.0.2, when every opening counted as a new
 * view: a view without playback, or one that got further than the unfinished
 * view before it, is merged into that one. Runs once after the update and
 * after restoring a backup. Returns the IDs of the changed videos.
 */
export async function mergeResumedViews(db: TrackerDB): Promise<string[]> {
  return db.transaction('rw', db.videos, db.views, async () => {
    const byVideo = new Map<string, View[]>();
    await db.views
      .where('source')
      .equals('extension')
      .each((v) => {
        if (v.kind !== 'watch' || v.isShort) return;
        const list = byVideo.get(v.videoId);
        if (list) list.push(v);
        else byVideo.set(v.videoId, [v]);
      });

    const changed = new Set<string>();
    const updates: View[] = [];
    const remove: number[] = [];
    const videos = new Map(
      (await db.videos.bulkGet([...byVideo.keys()])).filter((v) => v !== undefined).map((v) => [v!.id, v!]),
    );
    for (const [videoId, views] of byVideo) {
      if (views.length < 2) continue;
      const resetAt = videos.get(videoId)?.resetAt ?? 0;
      views.sort((a, b) => a.at - b.at);
      let open: View | null = null;
      for (const v of views) {
        // Views since 1.0.2 store `lastPosition` and were recorded with the
        // continue rule already: they are left alone (e.g. after restoring a backup).
        const continues =
          open !== null &&
          open.lastPosition === undefined &&
          v.lastPosition === undefined &&
          !(open.at < resetAt && resetAt <= v.at) &&
          ((v.watchedSeconds ?? 0) < 1 || (v.maxPosition ?? 0) >= (open.maxPosition ?? 0));
        if (open && continues) {
          open.watchedSeconds = (open.watchedSeconds ?? 0) + (v.watchedSeconds ?? 0);
          open.maxPosition = Math.max(open.maxPosition ?? 0, v.maxPosition ?? 0);
          open.durationSec ??= v.durationSec;
          if (v.finishedAt) open.finishedAt = v.finishedAt;
          remove.push(v.id!);
          if (!updates.includes(open)) updates.push(open);
          changed.add(videoId);
        } else {
          open = v;
        }
        if (open?.finishedAt) open = null;
      }
    }
    if (!remove.length) return [];
    await db.views.bulkPut(updates);
    await db.views.bulkDelete(remove);
    const ids = new Set(changed);
    await rebuildVideos(db, ids, new Map((await db.videos.bulkGet([...ids])).map((v) => [v!.id, v!])));
    return [...ids];
  });
}

export async function updateVideoMeta(
  db: TrackerDB,
  videoId: string,
  meta: VideoMeta & { title?: string },
): Promise<void> {
  const patch: Partial<Video> = { metaUpdatedAt: Date.now() };
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined && v !== '') (patch as Record<string, unknown>)[k] = v;
  }
  await db.videos.update(videoId, patch);
}

/** Videos seen within this time count as recent for filling in missing details. */
export const RECENT_META_MS = 30 * 86_400_000;

/**
 * Videos without details from YouTube (channel, length, date), newest first:
 * those known only from the progress bar, a history sync or an import. With
 * `recentOnly`, only videos watched within RECENT_META_MS. Videos YouTube had
 * no details for (deleted, private) are skipped.
 */
export async function videosMissingMeta(
  db: TrackerDB,
  { recentOnly, limit }: { recentOnly: boolean; limit: number },
): Promise<{ ids: string[]; total: number }> {
  const since = recentOnly ? Date.now() - RECENT_META_MS : 0;
  const ids: string[] = [];
  let total = 0;
  await db.videos
    .where('lastViewAt')
    .aboveOrEqual(since)
    .reverse()
    .each((v) => {
      if (v.metaUpdatedAt || v.metaTriedAt) return;
      total++;
      if (ids.length < limit) ids.push(v.id);
    });
  return { ids, total };
}

/** Remembers that YouTube had no details for these videos, so they are not asked again. */
export async function markMetaTried(db: TrackerDB, ids: string[]): Promise<void> {
  await db.videos.where('id').anyOf(ids).modify({ metaTriedAt: Date.now() });
}

export async function markUnwatched(db: TrackerDB, ids: string[]): Promise<void> {
  const resetAt = Date.now();
  await db.videos.where('id').anyOf(ids).modify({ status: 'unwatched', resetAt });
}

/** Re-marks reset videos as watched without adding a view. */
export async function markWatchedAgain(db: TrackerDB, ids: string[]): Promise<void> {
  await db.videos.where('id').anyOf(ids).modify({ status: 'watched' });
}

/**
 * Deletes videos and all of their views and remembers them as deleted, so
 * imports and automatic sources do not bring them back. With
 * `removeFromYoutube`, the videos are queued for removal from the YouTube
 * watch history (with the token if one is known). Returns the number queued.
 */
export async function deleteVideos(
  db: TrackerDB,
  ids: string[],
  { removeFromYoutube = false } = {},
): Promise<number> {
  return db.transaction('rw', [db.videos, db.views, db.deleted, db.ytTokens, db.pendingRemovals], async () => {
    await db.views.where('videoId').anyOf(ids).delete();
    await db.videos.bulkDelete(ids);
    const deletedAt = Date.now();
    await db.deleted.bulkPut(ids.map((id) => ({ id, deletedAt })));
    if (!removeFromYoutube) return 0;
    const tokens = await db.ytTokens.bulkGet(ids);
    await db.pendingRemovals.bulkPut(
      ids.map((videoId, i) => ({ videoId, token: tokens[i]?.token, queuedAt: deletedAt })),
    );
    await db.ytTokens.bulkDelete(ids);
    return ids.length;
  });
}

export async function saveYtTokens(db: TrackerDB, tokens: { videoId: string; token: string }[]): Promise<void> {
  const seenAt = Date.now();
  await db.ytTokens.bulkPut(tokens.map((t) => ({ ...t, seenAt })));
}

/** Queues all deleted videos for removal from the YouTube history (e.g. deleted before it worked). */
export async function queueAllDeletedForRemoval(db: TrackerDB): Promise<number> {
  return db.transaction('rw', db.deleted, db.pendingRemovals, async () => {
    const deleted = await db.deleted.toArray();
    const queuedAt = Date.now();
    await db.pendingRemovals.bulkPut(deleted.map((d) => ({ videoId: d.id, queuedAt })));
    return deleted.length;
  });
}

/** Hands out all queued YouTube-history removals (removed from the queue). */
export async function takePendingRemovals(db: TrackerDB): Promise<PendingRemoval[]> {
  return db.transaction('rw', db.pendingRemovals, async () => {
    const all = await db.pendingRemovals.toArray();
    await db.pendingRemovals.clear();
    return all;
  });
}

export async function requeueRemovals(db: TrackerDB, items: PendingRemoval[]): Promise<void> {
  await db.pendingRemovals.bulkPut(items);
}

/** Number of views per source. */
export async function countBySource(db: TrackerDB): Promise<Partial<Record<ViewSource, number>>> {
  const counts: Partial<Record<ViewSource, number>> = {};
  await db.views.each((v) => void (counts[v.source] = (counts[v.source] ?? 0) + 1));
  return counts;
}

/**
 * Removes all views of one source (e.g. to undo an import). Videos left
 * without views disappear; they are not marked as deleted.
 * Returns the number of removed views.
 */
export async function deleteBySource(db: TrackerDB, source: ViewSource): Promise<number> {
  return db.transaction('rw', db.videos, db.views, async () => {
    const rows = db.views.where('source').equals(source);
    const ids = new Set<string>();
    await rows.each((v) => void ids.add(v.videoId));
    const removed = await rows.delete();
    const existing = new Map(
      (await db.videos.bulkGet([...ids])).filter((v) => v !== undefined).map((v) => [v!.id, v!]),
    );
    await rebuildVideos(db, ids, existing);
    return removed;
  });
}

/**
 * Deletes a single view and updates its video.
 * Returns the updated video, or null if it had no views left and was removed.
 */
export async function deleteView(db: TrackerDB, viewId: number): Promise<Video | null> {
  return db.transaction('rw', db.videos, db.views, async () => {
    const view = await db.views.get(viewId);
    if (!view) return null;
    await db.views.delete(viewId);
    const old = await db.videos.get(view.videoId);
    const existing = new Map(old ? [[old.id, old]] : []);
    await rebuildVideos(db, new Set([view.videoId]), existing);
    return (await db.videos.get(view.videoId)) ?? null;
  });
}

export interface Mark {
  videoId: string;
  title: string;
  source: 'manual' | 'youtube-progress';
  isShort?: boolean;
  reportedPercent?: number;
}

/**
 * Marks videos as watched without a viewing session.
 * Manual marks re-mark reset videos and lift a deletion; the YouTube progress
 * bar only adds videos that are neither in the database nor deleted (so
 * resets and deletions stick). Returns the IDs whose watched state changed.
 */
export async function addMarks(db: TrackerDB, marks: Mark[], at = Date.now()): Promise<string[]> {
  return db.transaction('rw', db.videos, db.views, db.deleted, async () => {
    const ids = marks.map((m) => m.videoId);
    const existing = await db.videos.bulkGet(ids);
    const deleted = await tombstones(db, ids);
    const changed: string[] = [];
    for (const [i, m] of marks.entries()) {
      if (m.source === 'manual') await db.deleted.delete(m.videoId);
      else if (deleted.has(m.videoId)) continue;
      const old = existing[i];
      if (old) {
        if (m.source === 'manual' && old.status === 'unwatched') {
          await db.videos.update(m.videoId, { status: 'watched' });
          changed.push(m.videoId);
        }
        continue;
      }
      await db.views.add({
        videoId: m.videoId,
        at,
        kind: 'marked',
        source: m.source,
        // The bar shows that it was watched, not when.
        dateUncertain: m.source === 'youtube-progress',
        reportedPercent: m.reportedPercent,
        createdAt: Date.now(),
      });
      await db.videos.put({
        id: m.videoId,
        title: m.title,
        status: 'watched',
        firstViewAt: at,
        lastViewAt: at,
        viewCount: 1,
        isShort: m.isShort,
      });
      changed.push(m.videoId);
    }
    return changed;
  });
}

export interface ExternalView {
  videoId: string;
  title?: string;
  at: number;
  dateUncertain?: boolean;
  /** Only the day of `at` is known (YouTube history). */
  dayOnly?: boolean;
  isShort?: boolean;
}

/**
 * Adds videos missing in the database from an external record (browser or
 * YouTube history). Such records are imprecise and overlap with what is
 * already known, so they only fill gaps:
 * - a video already in the database is left alone (no extra views),
 * - a missing video gets one view, at its earliest date in the record,
 * - deleted videos only come back with a dated view after their deletion.
 * With `replace`, earlier views of the same source are removed first, so a
 * full sync can run any number of times. Returns the number of added videos
 * and the affected video IDs.
 */
export async function addExternalViews(
  db: TrackerDB,
  source: 'browser-history' | 'youtube-history',
  items: ExternalView[],
  { replace = false } = {},
): Promise<{ added: number; videoIds: string[] }> {
  return db.transaction('rw', db.videos, db.views, db.deleted, async () => {
    // Videos whose earlier views of this source are removed need a rebuild too.
    const replaced = new Set<string>();
    if (replace) {
      const old = db.views.where('source').equals(source);
      await old.each((v) => void replaced.add(v.videoId));
      await old.delete();
    }

    const ids = [...new Set(items.map((i) => i.videoId))];
    const deleted = await tombstones(db, ids);
    const knownVideos = new Set<string>();
    await db.views
      .where('videoId')
      .anyOf(ids)
      .each((v) => void knownVideos.add(v.videoId));

    const createdAt = Date.now();
    const add: View[] = [];
    // Title and Shorts flag from any entry of a video, not only the one that is added.
    const titles = new Map<string, string>();
    const shorts = new Set<string>();
    for (const item of items) {
      if (item.title && !titles.has(item.videoId)) titles.set(item.videoId, item.title);
      if (item.isShort) shorts.add(item.videoId);
    }
    // Dated entries first and oldest first, so a missing video gets its earliest date.
    const ordered = [...items].sort(
      (a, b) => Number(a.dateUncertain ?? false) - Number(b.dateUncertain ?? false) || a.at - b.at,
    );
    for (const item of ordered) {
      const id = item.videoId;
      if (knownVideos.has(id)) continue;
      const deletedAt = deleted.get(id);
      if (deletedAt !== undefined && (item.dateUncertain || item.at <= deletedAt)) continue;
      knownVideos.add(id);
      add.push({
        videoId: id,
        at: item.at,
        kind: 'imported',
        source,
        dateUncertain: item.dateUncertain ?? false,
        dayOnly: item.dayOnly,
        createdAt,
      });
    }
    await db.views.bulkAdd(add);

    const affected = new Set([...add.map((v) => v.videoId), ...replaced]);
    const existing = new Map(
      (await db.videos.bulkGet([...affected])).filter((v) => v !== undefined).map((v) => [v!.id, v!]),
    );
    await rebuildVideos(db, affected, existing, (id) => ({
      title: titles.get(id),
      ...(shorts.has(id) ? { isShort: true } : {}),
    }));
    return { added: add.length, videoIds: [...affected] };
  });
}

export interface TakeoutSummary {
  /** Takeout views written. */
  added: number;
  /** Takeout entries that were already known from another source. */
  known: number;
  /** Videos that were not in the database before. */
  newVideos: number;
  /** Videos whose undated or day-only views were replaced by exact times. */
  dated: number;
  /** Entries skipped because the video was deleted afterwards. */
  deleted: number;
}

/**
 * Imports the YouTube watch history from Google Takeout. Its times are exact
 * and every watch is listed, so unlike the history sync it adds rewatches:
 * - an entry within SAME_VIEW_MS of a known exact view of the video (any other
 *   source) is the same watch and is skipped,
 * - every other entry becomes a view,
 * - undated or day-only views of a video in the Takeout are removed; the
 *   Takeout has the real times,
 * - deleted videos only come back with views after their deletion.
 * Replaces the previous Takeout import, so it can run any number of times.
 */
export async function importTakeout(db: TrackerDB, entries: TakeoutEntry[]): Promise<TakeoutSummary> {
  return db.transaction('rw', db.videos, db.views, db.deleted, async () => {
    const affected = new Set<string>();
    const old = db.views.where('source').equals('takeout');
    await old.each((v) => void affected.add(v.videoId));
    await old.delete();

    const byVideo = new Map<string, TakeoutEntry[]>();
    for (const e of entries) {
      const list = byVideo.get(e.videoId);
      if (list) list.push(e);
      else byVideo.set(e.videoId, [e]);
    }
    const ids = [...byVideo.keys()];
    const idSet = new Set(ids);
    const existingViews = (
      ids.length <= 1000 ? await db.views.where('videoId').anyOf(ids).toArray() : await db.views.toArray()
    ).filter((v) => idSet.has(v.videoId));
    const exact = timesByVideo(existingViews.filter((v) => !isImprecise(v)));
    const imprecise = existingViews.filter(isImprecise);
    const knownBefore = new Set(existingViews.map((v) => v.videoId));
    const deleted = await tombstones(db, ids);

    const createdAt = Date.now();
    const add: View[] = [];
    const covered = new Set<string>();
    const summary: TakeoutSummary = { added: 0, known: 0, newVideos: 0, dated: 0, deleted: 0 };
    for (const [id, list] of byVideo) {
      const deletedAt = deleted.get(id);
      const times = list.map((e) => e.at).filter((at) => deletedAt === undefined || at > deletedAt);
      summary.deleted += list.length - times.length;
      if (!times.length) continue;
      covered.add(id);
      const fresh = unmatchedTimes(times, exact.get(id) ?? []);
      summary.known += times.length - fresh.length;
      for (const at of fresh) {
        add.push({ videoId: id, at, kind: 'imported', source: 'takeout', dateUncertain: false, createdAt });
      }
      if (fresh.length) affected.add(id);
      if (!knownBefore.has(id)) summary.newVideos++;
    }
    await db.views.bulkAdd(add);
    summary.added = add.length;

    const replaced = imprecise.filter((v) => covered.has(v.videoId));
    await db.views.bulkDelete(replaced.map((v) => v.id!));
    for (const v of replaced) affected.add(v.videoId);
    summary.dated = new Set(replaced.map((v) => v.videoId)).size;

    // Title, channel and music flag from the newest entry of a video.
    const info = new Map<string, Partial<Video>>();
    for (const [id, list] of byVideo) {
      const newest = list.reduce((a, b) => (b.at > a.at ? b : a));
      info.set(id, {
        title: newest.title || undefined,
        channelId: newest.channelId,
        channelName: newest.channelName,
        isMusic: list.some((e) => e.music) || undefined,
      });
    }
    const existing = new Map(
      (await db.videos.bulkGet([...affected])).filter((v) => v !== undefined).map((v) => [v!.id, v!]),
    );
    // Titles of known videos stay; Takeout titles carry the "Watched" prefix in other languages.
    await rebuildVideos(db, affected, existing, (id) => {
      const x = info.get(id) ?? {};
      return existing.has(id) ? { ...x, title: undefined } : x;
    });
    // Music flag and channel also for videos the Takeout added no view to.
    const rest = ids.filter((id) => !affected.has(id));
    if (rest.length) {
      await db.videos
        .where('id')
        .anyOf(rest)
        .modify((v) => {
          const x = info.get(v.id)!;
          if (x.isMusic) v.isMusic = true;
          if (!v.channelId && x.channelId) v.channelId = x.channelId;
          if (!v.channelName && x.channelName) v.channelName = x.channelName;
        });
    }
    return summary;
  });
}

export interface Stats {
  watched: number;
  /** Watched videos with at least two views with a known date. */
  multi: number;
  reset: number;
  views: number;
  uncertainViews: number;
}

export async function getStats(db: TrackerDB): Promise<Stats> {
  const [watched, reset, views] = await Promise.all([
    db.videos.where('status').equals('watched').count(),
    db.videos.where('status').equals('unwatched').count(),
    db.views.count(),
  ]);
  let uncertainViews = 0;
  const certain = new Map<string, number>();
  await db.views.each((v) => {
    if (v.dateUncertain) uncertainViews++;
    else certain.set(v.videoId, (certain.get(v.videoId) ?? 0) + 1);
  });
  let multi = 0;
  for (const n of certain.values()) if (n > 1) multi++;
  return { watched, multi, reset, views, uncertainViews };
}

// --- Backup -----------------------------------------------------------------

export const BACKUP_FORMAT = 'youtube-tracker-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: number;
  videos: Video[];
  views: View[];
  /** Deleted videos (missing in backups from before v0.3). */
  deleted?: Tombstone[];
  /** Hidden videos and playlists (missing in backups from before v0.5). */
  dismissed?: Dismissed[];
  /** The add-on's settings (missing in backups from before v1.1). */
  settings?: unknown;
}

export async function exportBackup(db: TrackerDB, settings?: unknown): Promise<Backup> {
  const [videos, views, deleted, dismissed] = await Promise.all([
    db.videos.toArray(),
    db.views.toArray(),
    db.deleted.toArray(),
    db.dismissed.toArray(),
  ]);
  return { format: BACKUP_FORMAT, version: 1, exportedAt: Date.now(), videos, views, deleted, dismissed, settings };
}

/**
 * Replaces the whole database with a backup; views from before 1.0.2 are
 * repaired (see mergeResumedViews). The backup's settings are returned, not
 * applied: the page decides.
 */
export async function restoreBackup(
  db: TrackerDB,
  data: unknown,
): Promise<{ videos: number; views: number; settings?: unknown }> {
  const b = data as Partial<Backup>;
  if (b?.format !== BACKUP_FORMAT || !Array.isArray(b.videos) || !Array.isArray(b.views)) {
    throw new Error(t.errors.backupInvalid);
  }
  await db.transaction('rw', [db.videos, db.views, db.deleted, db.dismissed], async () => {
    await db.videos.clear();
    await db.views.clear();
    await db.deleted.clear();
    await db.dismissed.clear();
    await db.videos.bulkAdd(b.videos!);
    await db.views.bulkAdd(b.views!);
    await db.deleted.bulkAdd(b.deleted ?? []);
    await db.dismissed.bulkAdd(b.dismissed ?? []);
  });
  await mergeResumedViews(db);
  return { videos: await db.videos.count(), views: await db.views.count(), settings: b.settings };
}

/** Details of a video that merging fills in where the current database has none. */
const MERGED_FIELDS = [
  'channelId',
  'channelName',
  'channelHandle',
  'durationSec',
  'publishedAt',
  'category',
  'isLive',
  'isShort',
  'isMusic',
  'metaUpdatedAt',
] as const;

/**
 * Adds a backup to the current database without removing anything: views not
 * known yet (same video, source and minute), missing videos and missing
 * details, hidden items. Videos deleted here stay deleted (their views from
 * before the deletion are skipped). The backup's settings are returned.
 */
export async function mergeBackup(
  db: TrackerDB,
  data: unknown,
): Promise<{ videos: number; views: number; settings?: unknown }> {
  const b = data as Partial<Backup>;
  if (b?.format !== BACKUP_FORMAT || !Array.isArray(b.videos) || !Array.isArray(b.views)) {
    throw new Error(t.errors.backupInvalid);
  }
  const key = (v: View) => `${v.videoId}|${v.source}|${Math.round(v.at / 60_000)}`;
  let addedVideos = 0;
  let addedViews = 0;
  await db.transaction('rw', [db.videos, db.views, db.deleted, db.dismissed], async () => {
    const deleted = new Map((await db.deleted.toArray()).map((d) => [d.id, d.deletedAt]));
    const known = new Set<string>();
    await db.views.each((v) => void known.add(key(v)));
    const add: View[] = [];
    for (const v of b.views!) {
      const deletedAt = deleted.get(v.videoId);
      if ((deletedAt !== undefined && v.at <= deletedAt) || known.has(key(v))) continue;
      known.add(key(v));
      const { id: _, ...rest } = v;
      add.push(rest);
    }
    await db.views.bulkAdd(add);
    addedViews = add.length;

    const existing = new Map((await db.videos.toArray()).map((v) => [v.id, v]));
    const affected = new Set(add.map((v) => v.videoId));
    for (const bv of b.videos!) {
      const cur = existing.get(bv.id);
      if (!cur) {
        if (!affected.has(bv.id)) continue; // no view of it survived (deleted here)
        existing.set(bv.id, bv);
        addedVideos++;
        continue;
      }
      let changed = false;
      for (const f of MERGED_FIELDS) {
        if (cur[f] === undefined && bv[f] !== undefined) {
          (cur as unknown as Record<string, unknown>)[f] = bv[f];
          changed = true;
        }
      }
      if (changed) affected.add(bv.id);
    }
    await rebuildVideos(db, affected, existing);

    const dismissed = new Set(await db.dismissed.toCollection().primaryKeys());
    await db.dismissed.bulkAdd((b.dismissed ?? []).filter((d) => !dismissed.has(d.id)));
    // A deletion from the backup only counts for videos this database does not have.
    await db.deleted.bulkPut((b.deleted ?? []).filter((d) => !existing.has(d.id) && !deleted.has(d.id)));
  });
  await mergeResumedViews(db);
  return { videos: addedVideos, views: addedViews, settings: b.settings };
}

export async function clearAll(db: TrackerDB): Promise<void> {
  const tables = [db.videos, db.views, db.deleted, db.ytTokens, db.pendingRemovals, db.playlists, db.dismissed];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}
