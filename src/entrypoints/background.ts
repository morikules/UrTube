import { readBrowserHistory } from '@/lib/browserHistory';
import {
  TrackerDB,
  addExternalViews,
  addMarks,
  countBySource,
  deleteBySource,
  deleteVideos,
  deleteView,
  getStats,
  markUnwatched,
  markMetaTried,
  markWatchedAgain,
  mergeResumedViews,
  queueAllDeletedForRemoval,
  recordMusicPlay,
  requeueRemovals,
  resumableView,
  saveYtTokens,
  setDismissed,
  startView,
  takePendingRemovals,
  updateVideoMeta,
  updateView,
  videosMissingMeta,
} from '@/lib/db';
import type { Broadcast, PageEvent, Request, ResponseMap, SyncResult } from '@/lib/messages';
import type { PlaylistInfo } from '@/lib/playlists';
import { setLanguage, t } from '@/lib/i18n';
import { loadSettings, onSettingsChanged } from '@/lib/settings';
import { musicKind } from '@/lib/youtube';

const HISTORY_ALARM = 'browser-history-sync';
/** Requests the content scripts on YouTube and YouTube Music send. */
const FROM_CONTENT = new Set<string>([
  'getWatched',
  'getMusic',
  'getDismissed',
  'getPlaylists',
  'savePlaylist',
  'startView',
  'updateView',
  'resumableView',
  'updateVideoMeta',
  'missingMeta',
  'metaNotFound',
  'addMarks',
  'deleteVideos',
  'setDismissed',
  'recordMusicPlay',
  'addYoutubeHistory',
  'takeRemovals',
  'requeueRemovals',
]);

export default defineBackground(() => {
  const db = new TrackerDB();

  // In-memory copy of all watched video IDs; content scripts ask for it once per page.
  let watched: Map<string, number> | null = null;
  /** Watched videos that are music, by how sure that is (see musicKind). */
  let music = { sure: new Set<string>(), category: new Set<string>() };

  async function loadWatched(): Promise<Map<string, number>> {
    if (!watched) {
      const map = new Map<string, number>();
      const found = { sure: new Set<string>(), category: new Set<string>() };
      await db.videos
        .where('status')
        .equals('watched')
        .each((v) => {
          map.set(v.id, v.lastViewAt);
          const kind = musicKind(v);
          if (kind) found[kind].add(v.id);
        });
      watched = map;
      music = found;
    }
    return watched;
  }

  /** New metadata can show that a video is music; YouTube tabs learn it right away. */
  async function checkMusic(videoId: string): Promise<void> {
    await loadWatched();
    const video = await db.videos.get(videoId);
    const kind = video ? musicKind(video) : null;
    if (!kind || music[kind].has(videoId)) return;
    music[kind].add(videoId);
    await broadcast({ type: 'musicChanged', videoId, kind });
  }

  async function broadcast(msg: Broadcast): Promise<void> {
    const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      if (tab.id !== undefined) browser.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  }

  /** Tells open extension pages (history list, popup) to reload. Debounced. */
  let pageEventTimer: ReturnType<typeof setTimeout> | undefined;
  function notifyPages(): void {
    clearTimeout(pageEventTimer);
    pageEventTimer = setTimeout(() => {
      const msg: PageEvent = { type: 'dataChanged' };
      browser.runtime.sendMessage(msg).catch(() => {}); // fails if no page is open
    }, 500);
  }

  /** For changes in the background (details filled in): pages reload at most every 30 s. */
  let slowNotifyTimer: ReturnType<typeof setTimeout> | undefined;
  function notifyPagesSlowly(): void {
    slowNotifyTimer ??= setTimeout(() => {
      slowNotifyTimer = undefined;
      notifyPages();
    }, 30_000);
  }

  /** Re-reads the given videos, updates the cache and tells YouTube tabs. */
  async function refresh(ids: string[]): Promise<void> {
    notifyPages();
    if (!ids.length) return;
    const cache = await loadWatched();
    const videos = await db.videos.bulkGet(ids);
    const changes: [string, number | null][] = ids.map((id, i) => {
      const v = videos[i];
      const at = v?.status === 'watched' ? v.lastViewAt : null;
      if (at === null) cache.delete(id);
      else cache.set(id, at);
      return [id, at];
    });
    await broadcast({ type: 'watchedChanged', changes });
  }

  /**
   * Work that needs the user's YouTube login runs in an open YouTube tab. Tabs
   * are tried one after the other (the active one first): a tab Firefox has
   * unloaded, or one opened before the add-on was updated, has no content script.
   */
  async function sendToYoutubeTab(msg: Broadcast): Promise<void> {
    const tabs = await browser.tabs.query({ url: '*://www.youtube.com/*' });
    const order = [...tabs.filter((t) => t.active), ...tabs.filter((t) => !t.active)].filter((t) => !t.discarded);
    for (const tab of order) {
      if (tab.id === undefined) continue;
      try {
        await browser.tabs.sendMessage(tab.id, msg);
        return;
      } catch {
        // No content script in this tab; try the next one.
      }
    }
    throw new Error(tabs.length ? t.errors.reloadYoutubeTab : t.errors.openYoutubeTab);
  }

  /** Asks one open YouTube tab to carry out queued removals from the YouTube history. */
  async function triggerRemovals(): Promise<void> {
    // Without a ready tab, this is done when the next YouTube page loads.
    await sendToYoutubeTab({ type: 'processRemovals' }).catch(() => {});
  }

  /** Set by "Abbrechen"; checked while the browser history is read. */
  let cancelBrowserSync = false;

  /** Imports YouTube visits from the Firefox history; full sync replaces earlier ones. */
  async function syncBrowserHistory(full: boolean): Promise<SyncResult> {
    if (!(await browser.permissions.contains({ permissions: ['history'] }))) {
      throw new Error(t.errors.noHistoryPermission);
    }
    cancelBrowserSync = false;
    const { browserHistorySyncedAt = 0 } = await browser.storage.local.get('browserHistorySyncedAt');
    const startedAt = Date.now();
    // Overlap of one day so visits recorded late are not missed; duplicates are skipped.
    const since = full ? 0 : Math.max(0, (browserHistorySyncedAt as number) - 86_400_000);
    const read = await readBrowserHistory(since, () => cancelBrowserSync);
    const { scanned, cancelled } = read;
    const { recordShorts } = await loadSettings();
    const views = recordShorts ? read.views : read.views.filter((v) => !v.isShort);
    // An aborted run only saw part of the history: add what it found, but replace nothing.
    const { added, videoIds } = await addExternalViews(db, 'browser-history', views, {
      replace: full && !cancelled,
    });
    if (!cancelled) await browser.storage.local.set({ browserHistorySyncedAt: startedAt });
    await refresh(videoIds);
    return { scanned, added, cancelled };
  }

  // Hidden ("Ausblenden") videos and playlists, cached for the content scripts.
  let dismissed: Set<string> | null = null;
  async function loadDismissed(): Promise<Set<string>> {
    if (!dismissed) dismissed = new Set(await db.dismissed.toCollection().primaryKeys());
    return dismissed;
  }

  async function handle(req: Request): Promise<ResponseMap[Request['type']]> {
    switch (req.type) {
      case 'getWatched':
        return [...(await loadWatched())];
      case 'getMusic':
        await loadWatched();
        return { sure: [...music.sure], category: [...music.category] };
      case 'recordMusicPlay': {
        const { recordYoutubeMusic } = await loadSettings();
        if (!recordYoutubeMusic) return null;
        const { type: _, ...play } = req;
        await recordMusicPlay(db, play);
        await refresh([req.videoId]);
        await checkMusic(req.videoId);
        return null;
      }
      case 'getVideo':
        return (await db.videos.get(req.videoId)) ?? null;
      case 'startView': {
        const { type: _, ...start } = req;
        const res = await startView(db, start);
        await refresh([req.videoId]);
        return res;
      }
      case 'resumableView':
        return resumableView(db, req.videoId);
      case 'updateView':
        // No page notification: progress arrives every few seconds while playing.
        await updateView(db, req.viewId, req.progress);
        return null;
      case 'updateVideoMeta':
        await updateVideoMeta(db, req.videoId, req.meta);
        if (req.quiet) notifyPagesSlowly();
        else notifyPages();
        await checkMusic(req.videoId);
        return null;
      case 'missingMeta':
        return videosMissingMeta(db, req);
      case 'metaNotFound':
        await markMetaTried(db, req.ids);
        return null;
      case 'addMarks': {
        // Manual marks always count; the progress bar respects "record Shorts".
        const { recordShorts } = await loadSettings();
        const marks = recordShorts ? req.marks : req.marks.filter((m) => m.source === 'manual' || !m.isShort);
        await refresh(await addMarks(db, marks));
        return null;
      }
      case 'markUnwatched':
        await markUnwatched(db, req.ids);
        await refresh(req.ids);
        return null;
      case 'markWatched':
        await markWatchedAgain(db, req.ids);
        await refresh(req.ids);
        return null;
      case 'deleteVideos': {
        const { removeFromYoutubeHistory } = await loadSettings();
        const queued = await deleteVideos(db, req.ids, { removeFromYoutube: removeFromYoutubeHistory });
        await refresh(req.ids);
        if (queued) await triggerRemovals();
        return null;
      }
      case 'deleteView': {
        const view = await db.views.get(req.viewId);
        const video = await deleteView(db, req.viewId);
        if (view) await refresh([view.videoId]);
        return video;
      }
      case 'getStats':
        return getStats(db);
      case 'reloadCache':
        watched = null;
        dismissed = null;
        await broadcast({ type: 'watchedReloaded' });
        await broadcast({ type: 'dismissedReloaded' });
        notifyPages();
        return null;
      case 'syncBrowserHistory':
        return syncBrowserHistory(true);
      case 'cancelBrowserHistorySync':
        cancelBrowserSync = true;
        return null;
      case 'getDismissed':
        return [...(await loadDismissed())];
      case 'setDismissed': {
        const { type: _, dismissed: on, ...item } = req;
        await setDismissed(db, item, on);
        const set = await loadDismissed();
        if (on) set.add(item.id);
        else set.delete(item.id);
        await broadcast({ type: 'dismissedChanged', id: item.id, dismissed: on });
        return null;
      }
      case 'countDismissed': {
        const counts = { video: 0, playlist: 0, channel: 0 };
        await db.dismissed.each((d) => void counts[d.kind]++);
        return counts;
      }
      case 'clearDismissed': {
        const rows = req.kind ? db.dismissed.filter((d) => d.kind === req.kind) : db.dismissed.toCollection();
        const count = await rows.delete();
        dismissed = null;
        await broadcast({ type: 'dismissedReloaded' });
        return count;
      }
      case 'getPlaylists':
        return (await db.playlists.bulkGet(req.ids)).filter((p) => p !== undefined) as PlaylistInfo[];
      case 'savePlaylist':
        await db.playlists.put(req.playlist);
        return null;
      case 'startYoutubeHistorySync':
        await sendToYoutubeTab({ type: 'runYoutubeHistorySync', full: req.full });
        return null;
      case 'startWatchLaterCleanup':
        await sendToYoutubeTab({ type: 'runWatchLaterCleanup' });
        return null;
      case 'syncSubscriptions':
        await sendToYoutubeTab({ type: 'runSubscriptionsSync' });
        return null;
      case 'countChannel':
        await sendToYoutubeTab({ type: 'runChannelCount', channelId: req.channelId });
        return null;
      case 'addYoutubeHistory': {
        await saveYtTokens(db, req.tokens);
        const { recordShorts } = await loadSettings();
        const views = recordShorts ? req.views : req.views.filter((v) => !v.isShort);
        const { added, videoIds } = await addExternalViews(db, 'youtube-history', views);
        await refresh(videoIds);
        return { added };
      }
      case 'takeRemovals':
        return takePendingRemovals(db);
      case 'requeueRemovals':
        await requeueRemovals(db, req.items);
        return null;
      case 'removeDeletedFromYoutube': {
        const queued = await queueAllDeletedForRemoval(db);
        await triggerRemovals();
        return queued;
      }
      case 'countBySource':
        return countBySource(db);
      case 'deleteBySource': {
        const removed = await deleteBySource(db, req.source);
        watched = null;
        await broadcast({ type: 'watchedReloaded' });
        notifyPages();
        return removed;
      }
    }
  }

  browser.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
    // YouTube tabs may only ask what they need; the rest is for the add-on page.
    if (sender.tab && !sender.url?.startsWith(browser.runtime.getURL('/')) && !FROM_CONTENT.has(req?.type)) {
      sendResponse({ error: 'not allowed' });
      return false;
    }
    handle(req).then(sendResponse, (err) => {
      console.error('[UrTube]', req.type, err);
      sendResponse({ error: String(err) });
    });
    return true;
  });

  // Toolbar button: open the add-on page, or switch to it if it is already open.
  const toolbar = browser.browserAction ?? browser.action;
  toolbar.onClicked.addListener(async () => {
    const url = browser.runtime.getURL('/options.html');
    const [tab] = await browser.tabs.query({ url: `${url}*` });
    if (tab?.id === undefined) {
      await browser.runtime.openOptionsPage();
      return;
    }
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
  });

  // First install: a short welcome on the add-on page.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') browser.tabs.create({ url: browser.runtime.getURL('/options.html#welcome') });
  });

  // Once after updating to 1.0.2: views that only continued an unfinished one are merged into it.
  browser.storage.local.get('mergedResumedViews').then(async ({ mergedResumedViews }) => {
    if (mergedResumedViews) return;
    const ids = await mergeResumedViews(db);
    await browser.storage.local.set({ mergedResumedViews: true });
    if (ids.length) {
      console.info('[UrTube] merged continued views of', ids.length, 'videos');
      await refresh(ids);
    }
  }).catch((err) => console.error('[UrTube] merging views', err));

  // Periodic incremental sync of the browser history, if enabled; interval from the settings.
  loadSettings().then((s) => {
    setLanguage(s.language);
    browser.alarms.create(HISTORY_ALARM, { periodInMinutes: s.syncIntervalMin });
  });
  let alarmMinutes: number | undefined;
  onSettingsChanged((s) => {
    setLanguage(s.language); // error messages sent to the pages
    if (s.syncIntervalMin === alarmMinutes) return;
    alarmMinutes = s.syncIntervalMin;
    browser.alarms.create(HISTORY_ALARM, { periodInMinutes: s.syncIntervalMin }); // replaces the old one
  });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== HISTORY_ALARM) return;
    const settings = await loadSettings();
    if (!settings.markFromBrowserHistory) return;
    syncBrowserHistory(false).catch((err) => console.error('[UrTube] history sync', err));
  });
});
