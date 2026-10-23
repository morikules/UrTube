/**
 * Playlists: reading their videos from YouTube's browse endpoint ("VL<id>")
 * and computing how many of them were watched.
 */
import { t } from './i18n';
import { findContinuation, isObj, text, walkKey, walkKeys, type Json } from './ytjson';

export interface PlaylistInfo {
  id: string;
  title?: string;
  /** Video IDs in playlist order (unavailable videos are left out by YouTube). */
  videoIds: string[];
  /** True if the playlist was larger than what was read (MAX_PLAYLIST_VIDEOS). */
  partial: boolean;
  fetchedAt: number;
  /** PLAYLIST_FORMAT at the time of reading; older entries are read again. */
  format?: number;
}

/**
 * Raise when the way playlists are read changes, so cached entries read the
 * old way are refreshed (v2: YouTube's lockupViewModel layout, v3: Shorts in
 * playlists).
 */
export const PLAYLIST_FORMAT = 3;

/** True if the playlist must be read (again): unknown, read the old way, or older than `maxAgeMs`. */
export function isPlaylistStale(p: PlaylistInfo | undefined, maxAgeMs: number, now = Date.now()): boolean {
  return !p || p.format !== PLAYLIST_FORMAT || now - p.fetchedAt > maxAgeMs;
}

/** Result of the last "clean up Watch later" run, in storage.local. */
export interface WatchLaterResult {
  at: number;
  removed: number;
  failed: number;
  error?: string;
}
export const WATCH_LATER_RESULT_KEY = 'watchLaterResult';

/** Larger playlists are only read up to this many videos. */
export const MAX_PLAYLIST_VIDEOS = 2000;
/** A channel's uploads are read further (they are counted, not shown as a list). */
export const MAX_CHANNEL_VIDEOS = 5000;

/**
 * YouTube keeps hidden upload playlists per channel, split by kind:
 * "UULF…" long videos, "UUSH…" Shorts, "UULV…" live streams, "UUMO…"
 * members-only videos (the channel ID without its "UC"). A list YouTube does
 * not give out (e.g. members-only for some accounts) is simply empty.
 */
export const CHANNEL_KINDS = { videos: 'UULF', shorts: 'UUSH', live: 'UULV', members: 'UUMO' } as const;
export type ChannelKind = keyof typeof CHANNEL_KINDS;

export function channelListId(channelId: string, kind: ChannelKind): string {
  return CHANNEL_KINDS[kind] + channelId.slice(2);
}

/**
 * Pseudo playlist holding the IDs of a channel's playlists (in `videoIds`),
 * so it is cached and refreshed like any playlist.
 */
const CHANNEL_PLAYLISTS = 'channel-playlists:';
export const channelPlaylistsId = (channelId: string) => CHANNEL_PLAYLISTS + channelId;
export const channelOfPlaylistsId = (id: string) => (id.startsWith(CHANNEL_PLAYLISTS) ? id.slice(CHANNEL_PLAYLISTS.length) : null);
/** Browse parameter of a channel's "Playlists" tab. */
export const CHANNEL_PLAYLISTS_PARAMS = 'EglwbGF5bGlzdHPyBgQKAkIA';

/** Playlist IDs on one page of a channel's "Playlists" tab. */
export function extractChannelPlaylistsPage(response: unknown): { playlistIds: string[]; continuation?: string } {
  const ids: string[] = [];
  walkKeys(response, (key, v) => {
    if (!isObj(v)) return;
    if (key === 'lockupViewModel' && v.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' && typeof v.contentId === 'string') {
      ids.push(v.contentId);
    }
    if ((key === 'gridPlaylistRenderer' || key === 'playlistRenderer') && typeof v.playlistId === 'string') ids.push(v.playlistId);
  });
  return { playlistIds: [...new Set(ids)], continuation: findContinuation(response) };
}

const ID_RE = /^[\w-]{11}$/;

/** Playlist ID from a link, if it points to a playlist (not to a video inside one). */
export function playlistIdFromUrl(href: string): string | null {
  const url = new URL(href, 'https://www.youtube.com');
  const list = url.searchParams.get('list');
  if (!list) return null;
  if (url.pathname === '/playlist') return list;
  // "/watch?v=…&list=…" without index is the playlist as a whole (thumbnail of a playlist card).
  if (url.pathname === '/watch' && !url.searchParams.has('index')) return list;
  return null;
}

/**
 * Playlists that are not fixed lists: mixes ("RD…") and temporary queues
 * ("TL…") change with every visit and have no meaningful progress.
 */
export function isTrackablePlaylist(id: string): boolean {
  return !/^(RD|TL)/.test(id);
}

/** Video ID of a shortsLockupViewModel: from its tap command, else its link. */
function shortsId(v: Json): string | undefined {
  const cmd = (v.onTap as Json | undefined)?.innertubeCommand as Json | undefined;
  const id = (cmd?.reelWatchEndpoint as Json | undefined)?.videoId;
  if (typeof id === 'string') return id;
  const url = ((cmd?.commandMetadata as Json | undefined)?.webCommandMetadata as Json | undefined)?.url;
  return typeof url === 'string' ? url.match(/\/shorts\/([\w-]{11})/)?.[1] : undefined;
}

/**
 * Videos, playlist title and continuation token from one page of a playlist.
 * Videos come as lockupViewModel (layout since 2026) or playlistVideoRenderer
 * (older layout). Only the list itself is searched, not header or sidebar.
 */
export function extractPlaylistPage(response: unknown): {
  videoIds: string[];
  title?: string;
  continuation?: string;
} {
  const r = isObj(response) ? response : {};
  const list = [r.contents, r.onResponseReceivedActions, r.continuationContents];
  const videoIds: string[] = [];
  const add = (id: unknown) => {
    if (typeof id === 'string' && ID_RE.test(id)) videoIds.push(id);
  };
  // One pass in document order, so the playlist order is kept.
  walkKeys(list, (key, v) => {
    if (!isObj(v)) return;
    if (key === 'lockupViewModel' && v.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') add(v.contentId);
    if (key === 'playlistVideoRenderer' || key === 'playlistPanelVideoRenderer') add(v.videoId);
    // Shorts (e.g. a channel's Shorts list) come as their own lockup.
    if (key === 'shortsLockupViewModel') add(shortsId(v));
  });
  let title: string | undefined;
  walkKey(response, 'playlistHeaderRenderer', (v) => {
    if (!title && isObj(v)) title = text(v.title);
  });
  if (!title) {
    // Newer page header: pageHeaderViewModel.title.dynamicTextViewModel.text.content
    walkKey(response, 'pageHeaderViewModel', (v) => {
      const t = isObj(v) ? ((v.title as Json | undefined)?.dynamicTextViewModel as Json | undefined)?.text : undefined;
      if (!title) title = text(t);
    });
  }
  return { videoIds: [...new Set(videoIds)], title, continuation: findContinuation(response) };
}

export interface PlaylistProgress {
  seen: number;
  total: number;
  /** All videos known and watched. */
  done: boolean;
  partial: boolean;
}

export function playlistProgress(p: PlaylistInfo, isWatched: (id: string) => boolean): PlaylistProgress {
  const seen = p.videoIds.filter(isWatched).length;
  const total = p.videoIds.length;
  return { seen, total, done: !p.partial && total > 0 && seen === total, partial: p.partial };
}

/** "12 / 23 watched", "✓ 23 / 23 watched", "12 / 2000+ watched" */
export function progressLabel(pr: PlaylistProgress): string {
  return `${pr.done ? '✓ ' : ''}${t.content.playlistProgress(String(pr.seen), `${pr.total}${pr.partial ? '+' : ''}`)}`;
}
