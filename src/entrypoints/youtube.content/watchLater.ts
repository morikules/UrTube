/**
 * Removes watched videos from the user's "Watch later" list (playlist "WL"),
 * through YouTube's internal "edit_playlist" endpoint, as YouTube's own
 * "Remove from Watch later" menu entry does.
 */
import { WATCH_LATER_RESULT_KEY, type WatchLaterResult } from '@/lib/playlists';
import { innertube, readConfig, sleep } from './innertube';
import { fetchPlaylist } from './playlists';

/** The list is read again after this time (it rarely changes while watching). */
const CACHE_MS = 15 * 60 * 1000;

export function createWatchLater() {
  let ids: Set<string> | null = null;
  let loadedAt = 0;

  async function load(force = false): Promise<Set<string>> {
    if (!ids || force || Date.now() - loadedAt > CACHE_MS) {
      ids = new Set((await fetchPlaylist('WL')).videoIds);
      loadedAt = Date.now();
    }
    return ids;
  }

  async function remove(videoId: string): Promise<void> {
    await innertube(
      readConfig(),
      'browse/edit_playlist',
      { playlistId: 'WL', actions: [{ action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: videoId }] },
      '/playlist?list=WL',
    );
    ids?.delete(videoId);
  }

  return {
    /** Called when a video counts as watched; removes it if it is on the list. */
    async onWatched(videoId: string): Promise<void> {
      try {
        if ((await load()).has(videoId)) await remove(videoId);
      } catch {
        // Not logged in or YouTube changed something: nothing to do.
      }
    },

    /** Removes all watched videos from the list at once (button on the add-on page). */
    async cleanup(isWatched: (id: string) => boolean): Promise<void> {
      const result: WatchLaterResult = { at: Date.now(), removed: 0, failed: 0 };
      try {
        const list = [...(await load(true))].filter(isWatched);
        for (const id of list) {
          try {
            await remove(id);
            result.removed++;
          } catch {
            result.failed++;
          }
          await sleep(300);
        }
      } catch (e) {
        result.error = String(e instanceof Error ? e.message : e);
      }
      await browser.storage.local.set({ [WATCH_LATER_RESULT_KEY]: result });
    },
  };
}
