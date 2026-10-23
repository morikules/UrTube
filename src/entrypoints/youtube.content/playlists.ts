/**
 * Playlist contents for the progress badges ("12 / 23 gesehen"). Cached in the
 * database; missing or outdated playlists are read one after the other from
 * YouTube's browse endpoint, gently, so many playlists on a page are no problem.
 */
import { send } from '@/lib/messages';
import {
  CHANNEL_PLAYLISTS_PARAMS,
  MAX_CHANNEL_VIDEOS,
  MAX_PLAYLIST_VIDEOS,
  PLAYLIST_FORMAT,
  channelOfPlaylistsId,
  extractChannelPlaylistsPage,
  extractPlaylistPage,
  isPlaylistStale,
  isTrackablePlaylist,
  type PlaylistInfo,
} from '@/lib/playlists';
import { innertube, readConfig, sleep } from './innertube';

const PAGE_DELAY_MS = 400;
const BETWEEN_PLAYLISTS_MS = 600;

/** The playlists of a channel ("Playlists" tab), stored as a pseudo playlist. */
async function fetchChannelPlaylists(id: string, channelId: string): Promise<PlaylistInfo> {
  const cfg = readConfig();
  const ids: string[] = [];
  let continuation: string | undefined;
  do {
    const response = await innertube(
      cfg,
      'browse',
      continuation ? { continuation } : { browseId: channelId, params: CHANNEL_PLAYLISTS_PARAMS },
      `/channel/${channelId}/playlists`,
    );
    const page = extractChannelPlaylistsPage(response);
    for (const p of page.playlistIds) if (!ids.includes(p)) ids.push(p);
    continuation = page.continuation;
    if (continuation) await sleep(PAGE_DELAY_MS);
  } while (continuation && ids.length < MAX_PLAYLIST_VIDEOS);
  return { id, videoIds: ids, partial: Boolean(continuation), fetchedAt: Date.now(), format: PLAYLIST_FORMAT };
}

export async function fetchPlaylist(id: string): Promise<PlaylistInfo> {
  const channelId = channelOfPlaylistsId(id);
  if (channelId) return fetchChannelPlaylists(id, channelId);
  // A channel's upload lists ("UU…") are counted, so they are read further.
  const max = id.startsWith('UU') ? MAX_CHANNEL_VIDEOS : MAX_PLAYLIST_VIDEOS;
  const cfg = readConfig();
  const videoIds: string[] = [];
  let title: string | undefined;
  let continuation: string | undefined;
  do {
    const response = await innertube(
      cfg,
      'browse',
      continuation ? { continuation } : { browseId: `VL${id}` },
      `/playlist?list=${encodeURIComponent(id)}`,
    );
    const page = extractPlaylistPage(response);
    title ??= page.title;
    for (const v of page.videoIds) if (!videoIds.includes(v)) videoIds.push(v);
    continuation = page.continuation;
    if (continuation) await sleep(PAGE_DELAY_MS);
  } while (continuation && videoIds.length < max);
  return { id, title, videoIds, partial: Boolean(continuation), fetchedAt: Date.now(), format: PLAYLIST_FORMAT };
}

/** `maxAgeMs` gives the current cache duration from the settings. */
export function createPlaylists(onUpdate: () => void, maxAgeMs: () => number) {
  const cache = new Map<string, PlaylistInfo>();
  /** Playlists already looked at in this tab (cache checked, fetched if needed). */
  const seen = new Set<string>();
  const queue: string[] = [];
  let pending = new Set<string>();
  /** Playlists to read again even if the cached copy is recent. */
  const forced = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let working = false;

  async function work(): Promise<void> {
    if (working || !queue.length) return;
    working = true;
    onUpdate(); // show the busy indicator
    while (queue.length) {
      const id = queue.shift()!;
      try {
        const playlist = await fetchPlaylist(id);
        cache.set(id, playlist);
        await send({ type: 'savePlaylist', playlist });
        onUpdate();
      } catch {
        // Private/deleted playlist or YouTube not ready: ignore, try again on next page load.
      }
      await sleep(BETWEEN_PLAYLISTS_MS);
    }
    working = false;
    onUpdate(); // hide the busy indicator
  }

  /** Collects requested playlists and checks them in one go. */
  async function flush(): Promise<void> {
    const ids = [...pending];
    pending = new Set();
    if (!ids.length) return;
    for (const p of await send({ type: 'getPlaylists', ids })) cache.set(p.id, p);
    onUpdate();
    for (const id of ids) {
      const stale = isPlaylistStale(cache.get(id), maxAgeMs()) || forced.has(id);
      forced.delete(id);
      if (stale && !queue.includes(id)) queue.push(id);
    }
    work();
  }

  return {
    get: (id: string) => cache.get(id),

    /** Number of playlists still to be read (0 = idle). */
    busy: () => queue.length + (working ? 1 : 0),

    /** Reads the playlists again now, however recent the cached copies are (manual sync). */
    refresh(ids: string[]): void {
      for (const id of ids) {
        if (!isTrackablePlaylist(id) || queue.includes(id)) continue;
        queue.push(id);
      }
      work();
    },

    /** Makes sure the playlist is known; `refresh` forces a new read (playlist page opened). */
    want(id: string, refresh = false): void {
      if (!isTrackablePlaylist(id)) return;
      if (refresh && !forced.has(id)) {
        const p = cache.get(id);
        if (!(p && !isPlaylistStale(p, maxAgeMs()) && Date.now() - p.fetchedAt < 10 * 60 * 1000)) {
          // not read in the last minutes
          seen.delete(id);
          forced.add(id);
        }
      }
      if (seen.has(id)) return;
      seen.add(id);
      pending.add(id);
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 200);
    },
  };
}
