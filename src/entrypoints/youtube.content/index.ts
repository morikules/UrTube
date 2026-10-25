import './style.css';
import type { EntryPoint, Mark, View } from '@/lib/db';
import { n, setLanguage, t } from '@/lib/i18n';
import { send, type Broadcast } from '@/lib/messages';
import {
  hideAreaOf,
  isHidingOn,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  toggleHiding,
  type Settings,
} from '@/lib/settings';
import {
  PLAYLIST_FORMAT,
  channelOfPlaylistsId,
  playlistIdFromUrl,
  playlistProgress,
  progressLabel,
} from '@/lib/playlists';
import { channelListIds } from '@/lib/channelStats';
import { subscriptionsDue, syncSubscriptions } from './subscriptions';
import { currentAccount } from './account';
import {
  channelKeyFromPath,
  entryFromPath,
  entryFromReferrer,
  formatDate,
  pageKind,
  playlistFromUrl,
  videoIdFromUrl,
  type PageKind,
} from '@/lib/youtube';
import { createBigPlayer } from './bigPlayer';
import { applyPlayerPrefs } from './playerPrefs';
import { HIDE_CARD_SELECTOR, hideReason, hideTarget, type HideReason } from './hide';
import { incrementalSyncDue, processRemovals, runHistorySync } from './history';
import { createPlaylists } from './playlists';
import { createWatchLater } from './watchLater';
import { readDomMeta, readPlayerMeta } from './player';
import { fillMissingMeta, recheckAll } from './metaFill';
import { createChannelStats } from './channelStats';

const LINK_SELECTOR = 'a[href*="watch?v="], a[href*="/shorts/"], a[href*="/playlist?list="]';
/** Suggested videos at the end of a video, inside the player (also in full screen). */
const ENDSCREEN_SELECTOR = 'a.ytp-modern-videowall-still, a.ytp-videowall-still';
/** Link of a video the channel placed on the end of its video ("end screen element"). */
const END_CARD_LINK = '.ytp-ce-video > a.ytp-ce-covering-overlay';
/** Delays up to this are "immediately": cards are handled before the page is drawn. */
const IMMEDIATE_MS = 100;
/** Updates of single elements on the page (buttons, switch) wait this long at most. */
const PAGE_UPDATE_MS = 100;
/** Classes of elements the extension inserts itself (ignored by the observer). */
const OWN_ELEMENTS = ['ytt-eye', 'ytt-ban', 'ytt-watch-btn', 'ytt-chan-btn', 'ytt-toggle', 'ytt-pl-progress', 'ytt-chan-stats'];
/** Channel link inside a card or on the video page. */
const CHANNEL_LINK = 'a[href^="/@"], a[href^="/channel/"]';
/** Places for the "hide channel" button on a channel page (new and old header layout). */
const CHANNEL_HEADER_HOSTS = [
  'ytd-browse[page-subtype="channels"] yt-page-header-view-model .yt-page-header-view-model__page-header-flexible-actions',
  'ytd-browse[page-subtype="channels"] yt-flexible-actions-view-model',
  'ytd-browse[page-subtype="channels"] ytd-c4-tabbed-header-renderer #buttons',
].join(', ');
/** YouTube's menu on the left (full and mini). */
const GUIDE_SELECTOR = 'ytd-guide-renderer, ytd-mini-guide-renderer, #guide, tp-yt-app-drawer';
const THUMB_CONTENT = 'img, yt-image, yt-thumbnail-view-model';
/** Video cards in all YouTube layouts, used to find a video's title. */
const CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-playlist-panel-video-renderer',
  'ytd-reel-item-renderer',
  'ytd-playlist-renderer',
  'ytd-grid-playlist-renderer',
  'ytd-compact-playlist-renderer',
  'yt-lockup-view-model',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
].join(', ');
const CARD_TITLE_SELECTOR =
  '#video-title, .yt-lockup-metadata-view-model__title, .shortsLockupViewModelHostMetadataTitle, h3';
/** YouTube's red "watched up to here" bar on thumbnails (old and new layout). */
const PROGRESS_SELECTOR =
  'ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model, .ytThumbnailOverlayProgressBarHost';

/** Seconds of playback before "actually playing" counts. */
const PLAYING_MIN_SEC = 1;
/** Seconds of playback before deciding whether an unfinished view is continued. */
const RESUME_CHECK_SEC = 3;
/** Playback starting at most this far before where it stopped continues the old view. */
const RESUME_TOLERANCE_SEC = 60;
/** Retries for reading video details from the player. */
const META_RETRY_MS = [0, 1500, 4000, 10000];
/** The trailer or featured video on a channel's home page. */
const CHANNEL_TRAILER_SELECTOR = 'ytd-channel-video-player-renderer, #c4-player';
/** Save playback progress at most this often while playing. */
const FLUSH_INTERVAL_MS = 15000;

const EYE_ON_PATH =
  'M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z';
const EYE_OFF_PATH =
  'M3.3 2 2 3.3l3.2 3.2C3.4 7.9 2.1 9.9 1.5 12c1.2 2.7 5 7 10.5 7 1.9 0 3.6-.5 5-1.3l3.7 3.7 1.3-1.3L3.3 2ZM12 16.5a4.5 4.5 0 0 1-4.2-6.1l1.9 1.9a2 2 0 0 0 2.4 2.4l1.9 1.9c-.6.2-1.3.3-2 .3ZM12 5c5.5 0 9.3 4.3 10.5 7-.5 1.2-1.5 2.7-2.9 4l-3.1-3.1a4.5 4.5 0 0 0-5.4-5.4L8.8 5.3C9.8 5.1 10.9 5 12 5Z';
/** Circle with a slash: "hide" (Ausblenden). */
const BAN_PATH =
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 0 1 6.3 12.9L7.1 5.7A8 8 0 0 1 12 4Zm-6.3 3.1 11.2 11.2A8 8 0 0 1 5.7 7.1Z';
/** Arrow back: "show again" (Einblenden). */
const UNBAN_PATH = 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z';

function musicSets(m: { sure: string[]; category: string[] }) {
  return { sure: new Set(m.sure), category: new Set(m.category) };
}

/** Creates an icon as DOM elements (no innerHTML, as addons.mozilla.org prefers). */
function svgIcon(className: string, path: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

interface Session {
  videoId: string;
  isShort: boolean;
  started: boolean;
  viewId: number | null;
  maxPosition: number;
  watchedSeconds: number;
  durationSec?: number;
  finishedAt?: number;
  lastTime: number | null;
  /** Where the current stretch of steady playback began (reset by seeks and ads). */
  playFrom: number | null;
  dirty: boolean;
  entry: EntryPoint;
  playlist: { playlistId?: string; playlistIndex?: number };
  /** Unfinished earlier view; whether this continues it is decided once it plays. */
  resume: Promise<View | null>;
  prev: View | null;
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*'],
  // Early, so watched videos are hidden before YouTube draws its first cards.
  runAt: 'document_start',

  async main() {
    const [loaded, watchedList, musicIds, dismissedIds] = await Promise.all([
      loadSettings(),
      send({ type: 'getWatched' }),
      send({ type: 'getMusic' }),
      send({ type: 'getDismissed' }),
    ]);
    let settings: Settings = loaded;
    let watched = new Map(watchedList);
    let music = musicSets(musicIds);
    /** Hidden ("Ausblenden") video and playlist IDs. */
    let dismissed = new Set(dismissedIds);
    let page: PageKind = pageKind(location.pathname);
    const watchLater = createWatchLater();
    /** Channels counted on request (statistics ↻): their playlists are read again too. */
    const countingChannels = new Set<string>();
    const playlists = createPlaylists(
      () => schedule(document),
      () => settings.playlistCacheHours * 3_600_000,
      (p) => {
        // A channel's playlists list was read: read the playlists themselves for their progress.
        const channelId = channelOfPlaylistsId(p.id);
        if (!channelId) return;
        if (countingChannels.delete(channelId)) playlists.refresh(p.videoIds);
        else for (const id of p.videoIds) playlists.want(id);
      },
    );
    const channelStats = createChannelStats(
      playlists,
      (id) => watched.has(id),
      () => settings.hideMembersInChannelStats,
    );

    // --- Display options as classes on <html>, so CSS does the work ---------

    function applySettingsClasses(): void {
      setLanguage(settings.language);
      // Texts drawn by CSS (badges on thumbnails) come from variables.
      const st = document.documentElement.style;
      st.setProperty('--ytt-t-watched', JSON.stringify(t.content.badgeWatched));
      st.setProperty('--ytt-t-hidden', JSON.stringify(t.content.hidden));
      st.setProperty('--ytt-t-channel-hidden', JSON.stringify(t.content.channelHidden));
      const c = document.documentElement.classList;
      c.toggle('ytt-fade', settings.fadeWatched);
      c.toggle('ytt-gray', settings.grayscaleWatched);
      c.toggle('ytt-badge', settings.showBadge);
      c.toggle('ytt-badge-date', settings.showBadgeDate);
      c.toggle('ytt-hide-progress', settings.hideProgressBar);
      c.toggle('ytt-eyes', settings.showEyeButton);
      c.toggle('ytt-ban-videos', settings.dismissVideos);
      c.toggle('ytt-ban-playlists', settings.dismissPlaylists);
      c.toggle('ytt-ban-channels', settings.dismissChannels);
      c.toggle('ytt-pl-progress-on', settings.showPlaylistProgress);
      // Hiding: the header switch, the page type and the shelf filters.
      c.toggle('ytt-hiding', isHidingOn(settings, page));
      for (const kind of ['subscriptions', 'home', 'channel'] as const) {
        c.toggle(`ytt-page-${kind}`, page === kind);
      }
      c.toggle('ytt-f-shorts', settings.filterShorts);
      c.toggle('ytt-f-relevant', settings.filterMostRelevant);
    }
    applySettingsClasses();

    const bigPlayer = createBigPlayer(() => settings);

    onSettingsChanged((s) => {
      settings = s;
      applySettingsClasses();
      bigPlayer.update(false);
      scan(document);
    });

    // --- Hiding cards ----------------------------------------------------------

    /** Hidden with ⊘ – only counts while hiding is enabled for that kind. */
    function isDismissed(id: string, kind: 'video' | 'playlist' | 'channel'): boolean {
      const enabled =
        kind === 'video' ? settings.dismissVideos : kind === 'playlist' ? settings.dismissPlaylists : settings.dismissChannels;
      return enabled && dismissed.has(id);
    }

    function playlistDone(listId: string): boolean {
      const p = playlists.get(listId);
      return p ? playlistProgress(p, (id) => watched.has(id)).done : false;
    }

    function evaluateCard(card: Element): void {
      const target = hideTarget(card);
      // The thumbnail link tells what the card is (video or playlist).
      const link =
        target.querySelector<HTMLAnchorElement>('a.ytt-thumb') ?? target.querySelector<HTMLAnchorElement>(LINK_SELECTOR);
      const href = link?.getAttribute('href') ?? '';
      const listId = href ? playlistIdFromUrl(href) : null;
      // Hidden channel: all its videos and playlists disappear (where the card names the channel).
      const chanHref = target.querySelector(CHANNEL_LINK)?.getAttribute('href');
      const chanKey = chanHref ? channelKeyFromPath(chanHref) : null;
      const channelHidden = chanKey !== null && isDismissed(chanKey, 'channel');
      link?.classList.toggle('ytt-chan-hidden', channelHidden);
      let reason: HideReason | null;
      if (channelHidden) {
        reason = 'dismissed';
      } else if (listId) {
        // Playlists: hidden by the user, or completely watched (on every page).
        reason = isDismissed(listId, 'playlist')
          ? 'dismissed'
          : settings.hidePlaylistsDone && playlistDone(listId)
            ? 'playlist-done'
            : null;
      } else {
        const id = href ? videoIdFromUrl(href) : null;
        // Hidden videos disappear everywhere, watched ones depending on the page.
        // Music can be kept visible: it is listened to again and again.
        const keep =
          id !== null &&
          settings.keepMusicVisible &&
          (music.sure.has(id) || (settings.musicFromCategory && music.category.has(id)));
        reason =
          id && isDismissed(id, 'video')
            ? 'dismissed'
            : hideReason(
                target,
                page,
                settings,
                id && !keep ? watched.get(id) : undefined,
                page === 'channel' && id !== null && channelStats.isMembersOnly(id),
              );
      }
      const el = target as HTMLElement;
      if (reason) {
        if (el.dataset.yttHide !== reason) el.dataset.yttHide = reason;
      } else if (el.dataset.yttHide) {
        delete el.dataset.yttHide;
      }
    }

    function evaluateCards(root: ParentNode): void {
      if (root instanceof Element) {
        const own = root.closest(HIDE_CARD_SELECTOR);
        if (own) evaluateCard(own);
      }
      root.querySelectorAll(HIDE_CARD_SELECTOR).forEach(evaluateCard);
    }

    // --- Switch in the header bar next to the search --------------------------

    function updateHeaderToggle(): void {
      const host = document.querySelector('ytd-masthead #center');
      let box = document.querySelector<HTMLElement>('.ytt-toggle');
      // On every page: hidden ("Ausblenden") items disappear everywhere.
      if (!host) {
        box?.remove();
        return;
      }
      if (!box || box.parentElement !== host) {
        box?.remove();
        box = document.createElement('div');
        box.className = 'ytt-toggle';
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.setAttribute('role', 'switch');
        sw.className = 'ytt-toggle-switch';
        sw.append(document.createElement('span'));
        const label = document.createElement('span');
        label.className = 'ytt-toggle-label';
        const spinner = document.createElement('span');
        spinner.className = 'ytt-toggle-spinner';
        box.append(sw, label, spinner);
        host.append(box);
      }
      // Spinner while playlists are being read in the background.
      const busy = playlists.busy();
      box.classList.toggle('is-busy', busy > 0);
      const spinnerTitle = busy ? t.content.readingPlaylists(String(busy)) : '';
      const spinnerEl = box.querySelector<HTMLElement>('.ytt-toggle-spinner');
      if (spinnerEl && spinnerEl.title !== spinnerTitle) spinnerEl.title = spinnerTitle;
      const btn = box.querySelector('button')!;
      const on = isHidingOn(settings, page);
      btn.setAttribute('aria-checked', String(on));
      // With one switch per area, the label names the area this switch belongs to.
      const area = settings.hideSwitchMode === 'perArea' ? hideAreaOf(page) : null;
      const areaName = area ? t.hide.areasShort[area] : '';
      btn.title = `${on ? t.content.switchShow : t.content.switchHide}${areaName ? ` (${areaName})` : ''}`;
      let label = areaName;
      if (settings.showHiddenCount) {
        const count = n(document.querySelectorAll('[data-ytt-hide]').length);
        const countText = on ? t.content.countHidden(count) : t.content.countHideable(count);
        label = areaName ? `${areaName} · ${countText}` : countText;
      }
      const labelEl = box.querySelector('.ytt-toggle-label')!;
      if (labelEl.textContent !== label) labelEl.textContent = label;
    }

    // --- Thumbnails -----------------------------------------------------------

    function titleNear(a: Element): string {
      const card = a.closest(CARD_SELECTOR);
      const title = card?.querySelector(CARD_TITLE_SELECTOR)?.textContent?.trim();
      return title || a.getAttribute('title') || a.getAttribute('aria-label') || '';
    }

    /** Eye (watched) for videos, ⊘ (hide) for videos and playlists. */
    function ensureButtons(a: HTMLAnchorElement, withEye: boolean): void {
      const eye = a.querySelector(':scope > .ytt-eye');
      if (withEye && !eye) {
        const btn = document.createElement('button');
        btn.className = 'ytt-eye';
        btn.type = 'button';
        btn.title = t.content.eyeTitle;
        btn.append(svgIcon('ytt-eye-on', EYE_ON_PATH), svgIcon('ytt-eye-off', EYE_OFF_PATH));
        a.append(btn);
      } else if (!withEye) {
        eye?.remove();
      }
      if (!a.querySelector(':scope > .ytt-ban')) {
        const btn = document.createElement('button');
        btn.className = 'ytt-ban';
        btn.type = 'button';
        btn.title = t.content.banTitle;
        btn.append(svgIcon('ytt-ban-on', BAN_PATH), svgIcon('ytt-ban-off', UNBAN_PATH));
        a.append(btn);
      }
    }

    function clearThumb(a: HTMLAnchorElement): void {
      if (a.classList.contains('ytt-pl-inline')) {
        a.classList.remove('ytt-pl-inline');
        delete a.dataset.yttPl;
      }
      if (!a.classList.contains('ytt-thumb')) return;
      a.classList.remove('ytt-thumb', 'ytt-watched', 'ytt-pl-thumb', 'ytt-pl-done', 'ytt-dismissed');
      delete a.dataset.yttPl;
      a.querySelector(':scope > .ytt-eye')?.remove();
      a.querySelector(':scope > .ytt-ban')?.remove();
    }

    /** Playlist thumbnail: progress badge and hide button. */
    function applyPlaylist(a: HTMLAnchorElement, listId: string): void {
      a.classList.add('ytt-thumb', 'ytt-pl-thumb');
      a.classList.remove('ytt-watched');
      a.dataset.yttId = listId;
      a.dataset.yttKind = 'playlist';
      ensureButtons(a, false);
      const hidden = isDismissed(listId, 'playlist');
      a.classList.toggle('ytt-dismissed', hidden);
      // Hidden playlists are not read: their progress does not matter.
      if (!hidden) playlists.want(listId);
      const p = playlists.get(listId);
      // Entries read the old way (wrong "0 / 0") are not shown until read again.
      if (p && p.format === PLAYLIST_FORMAT) {
        const pr = playlistProgress(p, (id) => watched.has(id));
        const label = progressLabel(pr);
        if (a.dataset.yttPl !== label) a.dataset.yttPl = label;
        a.classList.toggle('ytt-pl-done', pr.done);
      }
    }

    /** Playlist link outside a card (shelf heading): progress as a small label after it. */
    function applyPlaylistInline(a: HTMLAnchorElement, listId: string): void {
      if (a.classList.contains('ytt-thumb')) clearThumb(a);
      playlists.want(listId);
      const p = playlists.get(listId);
      if (isDismissed(listId, 'playlist') || !p || p.format !== PLAYLIST_FORMAT) {
        clearThumb(a);
        return;
      }
      a.classList.add('ytt-pl-inline');
      const label = progressLabel(playlistProgress(p, (id) => watched.has(id)));
      if (a.dataset.yttPl !== label) a.dataset.yttPl = label;
    }

    // Marks found via YouTube's progress bar, sent in batches.
    const pendingMarks = new Map<string, Mark>();
    const sentMarks = new Set<string>();
    let marksScheduled = false;

    function detectProgressBar(a: HTMLAnchorElement, id: string, href: string): void {
      if (sentMarks.has(id) || pendingMarks.has(id)) return;
      const bar = a.querySelector(PROGRESS_SELECTOR);
      if (!bar) return;
      const width = bar.querySelector<HTMLElement>('[style*="width"]')?.style.width ?? '';
      const percent = parseFloat(width);
      pendingMarks.set(id, {
        videoId: id,
        title: titleNear(a),
        source: 'youtube-progress',
        isShort: href.includes('/shorts/'),
        reportedPercent: Number.isFinite(percent) ? Math.round(percent) : undefined,
      });
      if (marksScheduled) return;
      marksScheduled = true;
      setTimeout(() => {
        marksScheduled = false;
        const marks = [...pendingMarks.values()];
        pendingMarks.clear();
        for (const m of marks) sentMarks.add(m.videoId);
        currentAccount()
          .then((account) => send({ type: 'addMarks', marks: marks.map((m) => ({ ...m, account })) }))
          .catch(() => {});
      }, 1000);
    }

    /**
     * Suggestions at the end of a video and the videos a channel places there
     * (in the player): marked like other thumbnails, videos hidden with ⊘ are
     * left out while hiding is on; no buttons are added there.
     */
    function applyEndscreen(el: HTMLElement, href: string): void {
      // Playlists and mixes start with some video; they are not marked as that one.
      const isList = el.dataset.isList === 'true' || el.dataset.isMix === 'true';
      const id = isList ? null : videoIdFromUrl(href);
      const at = id ? watched.get(id) : undefined;
      el.classList.add('ytt-endscreen');
      el.classList.toggle('ytt-watched', at !== undefined);
      el.classList.toggle('ytt-dismissed', id !== null && isDismissed(id, 'video'));
      if (at !== undefined) el.dataset.yttDate = formatDate(at);
    }

    function apply(a: HTMLAnchorElement): void {
      if (a.matches(ENDSCREEN_SELECTOR)) {
        applyEndscreen(a, a.href);
        return;
      }
      if (a.matches(END_CARD_LINK)) {
        applyEndscreen(a.parentElement!, a.href);
        return;
      }
      const href = a.getAttribute('href') ?? '';
      if (
        !href ||
        !a.querySelector(THUMB_CONTENT) ||
        // YouTube's menu on the left ("Watch later", "Liked videos" …) is no content.
        a.closest(GUIDE_SELECTOR) ||
        // A link wrapping a whole row with its own thumbnail link inside (e.g. the
        // playlist panel next to a video): only the inner one gets the buttons.
        a.querySelector(LINK_SELECTOR)
      ) {
        clearThumb(a);
        return;
      }
      const listId = playlistIdFromUrl(href);
      if (listId) {
        // Thumbnails in cards get the label on the picture; shelf headings on
        // channel pages link to the playlist too and get it inline after the text.
        if (a.closest(CARD_SELECTOR)) applyPlaylist(a, listId);
        else applyPlaylistInline(a, listId);
        return;
      }
      const id = videoIdFromUrl(href);
      if (!id) {
        clearThumb(a);
        return;
      }
      a.classList.add('ytt-thumb');
      a.classList.remove('ytt-pl-thumb', 'ytt-pl-done');
      delete a.dataset.yttPl;
      a.dataset.yttId = id;
      a.dataset.yttKind = 'video';
      ensureButtons(a, true);
      a.classList.toggle('ytt-dismissed', isDismissed(id, 'video'));

      const at = watched.get(id);
      if (at !== undefined) {
        a.classList.add('ytt-watched');
        a.dataset.yttDate = formatDate(at);
      } else {
        a.classList.remove('ytt-watched');
        if (settings.markFromProgressBar) detectProgressBar(a, id, href);
      }
    }

    /** Thumbnails and cards inside `root`: marking and hiding. */
    function scanCards(root: ParentNode): void {
      if (root instanceof HTMLAnchorElement) apply(root);
      root.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR).forEach(apply);
      evaluateCards(root);
    }

    function scan(root: ParentNode): void {
      scanCards(root);
      updatePage();
    }

    /** Single elements of the page: buttons, the switch, channel statistics, chat. */
    function updatePage(): void {
      updateWatchButton();
      updateChannelButton();
      updateHeaderToggle();
      updatePlaylistHeader();
      channelStats.update(settings.showChannelStats, page === 'channel');
      collapseLiveChat();
    }

    /**
     * Live chat: collapsed once per video when it appears (YouTube's own
     * "Hide chat" button), so "Show chat" still brings it back.
     */
    let chatCollapsedFor: string | null = null;
    function collapseLiveChat(): void {
      if (!settings.hideLiveChat || page !== 'watch') return;
      // From the address, not the session: scan also runs before the session exists.
      const id = videoIdFromUrl(location.href);
      if (!id || chatCollapsedFor === id) return;
      const frame = document.querySelector('ytd-live-chat-frame#chat, ytd-live-chat-frame');
      if (!frame) return;
      if (frame.hasAttribute('collapsed')) {
        chatCollapsedFor = id;
        return;
      }
      const button = frame.querySelector<HTMLElement>('#show-hide-button button, #show-hide-button tp-yt-paper-button');
      if (!button) return;
      chatCollapsedFor = id;
      button.click();
    }

    // Collect changed nodes and process them in one batch instead of per mutation.
    // The delay is adjustable: longer means less work while YouTube loads videos.
    const pending = new Set<ParentNode>();
    let scheduled = false;
    function schedule(node: ParentNode): void {
      pending.add(node);
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        const nodes = pending.has(document) ? [document] : [...pending];
        pending.clear();
        for (const n of nodes) if ((n as Node).isConnected) scan(n);
      }, settings.scanDelayMs);
    }

    // --- Progress on a playlist page ---------------------------------------------
    // Shown next to the switch in the header: YouTube's playlist header has
    // several layouts, the header bar is the same on every page.

    function updatePlaylistHeader(): void {
      const listId = location.pathname === '/playlist' ? new URLSearchParams(location.search).get('list') : null;
      let chip = document.querySelector<HTMLElement>('.ytt-pl-progress');
      if (!listId || !settings.showPlaylistProgress) {
        chip?.remove();
        return;
      }
      playlists.want(listId, true); // read again when the page is opened
      const host = document.querySelector('.ytt-toggle');
      if (!host) {
        chip?.remove();
        return;
      }
      if (!chip || chip.parentElement !== host) {
        chip?.remove();
        chip = document.createElement('div');
        chip.className = 'ytt-pl-progress';
        host.append(chip);
      }
      const p = playlists.get(listId);
      const text =
        p && p.format === PLAYLIST_FORMAT
          ? progressLabel(playlistProgress(p, (id) => watched.has(id)))
          : t.content.readingProgress;
      if (chip.textContent !== text) chip.textContent = text;
    }

    // "Immediately": cards are handled right in the observer, which runs before
    // the browser draws the page, so watched videos and their red bars never show.
    // The page's single elements follow shortly after.
    let pageScheduled = false;
    function schedulePage(): void {
      if (pageScheduled) return;
      pageScheduled = true;
      setTimeout(() => {
        pageScheduled = false;
        updatePage();
      }, PAGE_UPDATE_MS);
    }

    new MutationObserver((mutations) => {
      const changed = new Set<Element>();
      for (const m of mutations) {
        if (m.type === 'attributes') changed.add(m.target as Element);
        else {
          m.addedNodes.forEach((n) => {
            // Ignore our own elements to avoid feedback loops.
            if (n instanceof Element) {
              if (!OWN_ELEMENTS.some((c) => n.classList.contains(c))) changed.add(n);
            } else if (
              n.nodeType === Node.TEXT_NODE &&
              m.target instanceof Element &&
              // The player updates its time display every second.
              !m.target.closest('ytd-player, #movie_player')
            ) {
              // Texts like "vor 3 Tagen" or "Geplant für …" are often filled in later.
              changed.add(m.target);
            }
          });
        }
      }
      if (!changed.size) return;
      if (settings.scanDelayMs <= IMMEDIATE_MS) {
        // YouTube fills a card in many small steps: each card is handled once,
        // and nothing inside an element that is handled anyway.
        const roots = new Set<Element>();
        for (const el of changed) if (el.isConnected) roots.add(el.closest(HIDE_CARD_SELECTOR) ?? el);
        for (const el of roots) {
          let p = el.parentElement;
          while (p && !roots.has(p)) p = p.parentElement;
          if (!p) scanCards(el);
        }
        schedulePage();
      } else {
        changed.forEach(schedule);
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      // YouTube recycles elements and only swaps the link target.
      attributeFilter: ['href'],
    });

    /** Eye button: watched → delete completely, otherwise mark as watched. */
    async function toggleWatched(id: string, title: string, isShort: boolean): Promise<void> {
      if (watched.has(id)) await send({ type: 'deleteVideos', ids: [id] });
      else {
        const account = await currentAccount();
        await send({ type: 'addMarks', marks: [{ videoId: id, title, source: 'manual', isShort, account }] });
      }
    }

    /** ⊘ button: hide the video/playlist (not counted as watched), or show it again. */
    async function toggleDismissed(a: HTMLAnchorElement): Promise<void> {
      const id = a.dataset.yttId;
      if (!id) return;
      await send({
        type: 'setDismissed',
        id,
        kind: a.dataset.yttKind === 'playlist' ? 'playlist' : 'video',
        title: titleNear(a) || undefined,
        ...channelNear(a),
        dismissed: !dismissed.has(id),
      });
    }

    /** Channel of a card, for the list of hidden items. On a channel page the cards show none. */
    function channelNear(a: Element): { channelKey?: string; channelName?: string } {
      const card = a.closest(CARD_SELECTOR);
      const links = card ? [...card.querySelectorAll<HTMLAnchorElement>(CHANNEL_LINK)] : [];
      // The avatar link has no text; the one with the name is better.
      const link = links.find((l) => l.textContent?.trim()) ?? links[0];
      const key = link
        ? channelKeyFromPath(link.getAttribute('href') ?? '')
        : page === 'channel'
          ? channelKeyFromPath(location.pathname)
          : null;
      const name = link?.textContent?.trim() || (page === 'channel' ? currentChannel()?.name : undefined);
      return { channelKey: key ?? undefined, channelName: name || key || undefined };
    }

    // Capture phase: handle our buttons before YouTube opens the video.
    document.addEventListener(
      'click',
      (e) => {
        // Only real clicks: scripts on the page must not delete or hide anything.
        if (!e.isTrusted) return;
        const target = e.target as Element | null;
        const eye = target?.closest?.('.ytt-eye');
        const ban = target?.closest?.('.ytt-ban');
        const watchBtn = target?.closest?.('.ytt-watch-btn');
        const chanBtn = target?.closest?.<HTMLElement>('.ytt-chan-btn');
        const hideSwitch = target?.closest?.('.ytt-toggle-switch');
        if (!eye && !ban && !watchBtn && !chanBtn && !hideSwitch) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (chanBtn) {
          const key = chanBtn.dataset.yttChannel;
          if (key) {
            send({
              type: 'setDismissed',
              id: key,
              kind: 'channel',
              title: chanBtn.dataset.yttChannelName,
              dismissed: !dismissed.has(key),
            });
          }
        } else if (hideSwitch) {
          // Saved settings reach all YouTube tabs via onSettingsChanged.
          saveSettings(toggleHiding(settings, page));
        } else if (ban) {
          const a = ban.closest<HTMLAnchorElement>('a.ytt-thumb');
          if (a) toggleDismissed(a);
        } else if (eye) {
          const a = eye.closest<HTMLAnchorElement>('a.ytt-thumb');
          const id = a?.dataset.yttId;
          if (a && id) toggleWatched(id, titleNear(a), a.href.includes('/shorts/'));
        } else if (session) {
          toggleWatched(session.videoId, pageTitle(), session.isShort);
        }
      },
      true,
    );

    // --- Button on the video page ---------------------------------------------

    function updateWatchButton(): void {
      const id = location.pathname === '/watch' ? videoIdFromUrl(location.href) : null;
      const host = document.querySelector('ytd-watch-metadata #title');
      let btn = document.querySelector<HTMLButtonElement>('.ytt-watch-btn');
      if (!id || !host) {
        btn?.remove();
        return;
      }
      if (!btn || btn.parentElement !== host) {
        btn?.remove();
        btn = document.createElement('button');
        btn.className = 'ytt-watch-btn';
        btn.type = 'button';
        host.append(btn);
      }
      const at = watched.get(id);
      const text = at !== undefined ? t.content.watchedOn(formatDate(at)) : t.content.markWatched;
      if (btn.textContent !== text) btn.textContent = text;
      btn.classList.toggle('is-watched', at !== undefined);
    }

    // --- "Hide channel" button on the channel page and next to a video's title ---

    /** The channel this page is about: channel page itself, or the owner of the video. */
    function currentChannel(): { key: string; name: string; host: Element } | null {
      if (page === 'channel') {
        const key = channelKeyFromPath(location.pathname);
        const header = document.querySelector('ytd-browse[page-subtype="channels"] h1');
        const host = document.querySelector(CHANNEL_HEADER_HOSTS) ?? header?.parentElement;
        return key && host ? { key, name: header?.textContent?.trim() ?? key, host } : null;
      }
      if (location.pathname === '/watch') {
        const link = document.querySelector<HTMLAnchorElement>(
          `ytd-watch-metadata ytd-channel-name ${CHANNEL_LINK}, ytd-watch-metadata #owner ${CHANNEL_LINK}`,
        );
        const key = link ? channelKeyFromPath(link.getAttribute('href') ?? '') : null;
        const host = document.querySelector('ytd-watch-metadata #title');
        return key && host ? { key, name: link!.textContent?.trim() || key, host } : null;
      }
      return null;
    }

    function updateChannelButton(): void {
      let btn = document.querySelector<HTMLButtonElement>('.ytt-chan-btn');
      const ch = currentChannel();
      if (!ch) {
        btn?.remove();
        return;
      }
      if (!btn || btn.parentElement !== ch.host) {
        btn?.remove();
        btn = document.createElement('button');
        btn.className = 'ytt-chan-btn';
        btn.type = 'button';
        // Icon and text like YouTube's own buttons next to it.
        const label = document.createElement('span');
        label.className = 'ytt-chan-btn-text';
        btn.append(svgIcon('ytt-ban-on', BAN_PATH), svgIcon('ytt-ban-off', UNBAN_PATH), label);
        ch.host.append(btn);
      }
      btn.dataset.yttChannel = ch.key;
      btn.dataset.yttChannelName = ch.name;
      const hidden = dismissed.has(ch.key);
      btn.classList.toggle('is-hidden', hidden);
      const text = hidden ? t.content.showChannel : t.content.hideChannel;
      const label = btn.querySelector('.ytt-chan-btn-text')!;
      if (label.textContent !== text) label.textContent = text;
      btn.title = hidden ? t.content.showChannelTitle : t.content.hideChannelTitle;
    }

    scan(document);

    browser.runtime.onMessage.addListener((msg: Broadcast) => {
      if (msg.type === 'watchedChanged') {
        for (const [id, at] of msg.changes) {
          if (at === null) watched.delete(id);
          else watched.set(id, at);
          sentMarks.delete(id);
        }
        scan(document);
      } else if (msg.type === 'watchedReloaded') {
        Promise.all([send({ type: 'getWatched' }), send({ type: 'getMusic' })]).then(([list, musicIds]) => {
          watched = new Map(list);
          music = musicSets(musicIds);
          sentMarks.clear();
          scan(document);
          recheckAll().then(fillMeta); // e.g. a restored backup or import with videos lacking details
        });
      } else if (msg.type === 'musicChanged') {
        music[msg.kind].add(msg.videoId);
        scan(document);
      } else if (msg.type === 'dismissedChanged') {
        if (msg.dismissed) dismissed.add(msg.id);
        else dismissed.delete(msg.id);
        scan(document);
      } else if (msg.type === 'dismissedReloaded') {
        send({ type: 'getDismissed' }).then((ids) => {
          dismissed = new Set(ids);
          scan(document);
        });
      } else if (msg.type === 'runYoutubeHistorySync') {
        runHistorySync(msg.full);
      } else if (msg.type === 'runSubscriptionsSync') {
        syncSubscriptions();
      } else if (msg.type === 'runChannelCount') {
        countingChannels.add(msg.channelId);
        playlists.refresh(channelListIds(msg.channelId));
      } else if (msg.type === 'runWatchLaterCleanup') {
        watchLater.cleanup((id) => watched.has(id));
      } else if (msg.type === 'processRemovals') {
        processRemovals();
      }
    });

    // --- YouTube watch history: incremental sync about once an hour ---------

    async function maybeSyncHistory(): Promise<void> {
      if (settings.markFromYoutubeHistory && (await incrementalSyncDue(settings.syncIntervalMin * 60_000))) {
        await runHistorySync(false);
      }
    }
    // --- Channel, length and date for videos known without them --------------

    function fillMeta(): void {
      if (!settings.fetchMissingMeta) return;
      const all = settings.fetchMissingMetaAll;
      fillMissingMeta(all, () => settings.fetchMissingMeta && (!all || settings.fetchMissingMetaAll));
    }
    let fillAllBefore = settings.fetchMissingMeta && settings.fetchMissingMetaAll;
    onSettingsChanged((s) => {
      const fillAll = s.fetchMissingMeta && s.fetchMissingMetaAll;
      if (fillAll && !fillAllBefore) recheckAll().then(fillMeta); // switched on in the options page
      fillAllBefore = fillAll;
    });

    // Give the page time to finish loading before the first check.
    // Subscribed channels for the statistics: read once a day.
    const maybeSyncSubscriptions = async () => {
      if (await subscriptionsDue()) await syncSubscriptions();
    };
    setTimeout(() => {
      processRemovals().catch(() => {}); // removals queued while no YouTube tab was open
      maybeSyncHistory();
      fillMeta();
      maybeSyncSubscriptions();
    }, 15_000);
    setInterval(() => {
      maybeSyncHistory(); // checks only; the interval is a setting
      fillMeta();
      maybeSyncSubscriptions();
    }, 5 * 60 * 1000);

    // --- Recording views ----------------------------------------------------

    let session: Session | null = null;
    /** Where the current page was opened from; the first page uses the referrer. */
    let entry: EntryPoint = entryFromReferrer(document.referrer);
    let prevUrl: string | null = null;

    function pageVideoId(): string | null {
      const { pathname } = location;
      if (pathname === '/watch' || pathname.startsWith('/shorts/')) {
        return videoIdFromUrl(location.href);
      }
      return null;
    }

    function pageTitle(): string {
      const h1 = document.querySelector('ytd-watch-metadata h1')?.textContent?.trim();
      if (h1 && location.pathname === '/watch') return h1;
      return document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
    }

    function flush(s: Session | null = session): void {
      if (!s || s.viewId === null || !s.dirty) return;
      s.dirty = false;
      send({
        type: 'updateView',
        viewId: s.viewId,
        progress: {
          maxPosition: s.maxPosition,
          lastPosition: s.lastTime ?? undefined,
          watchedSeconds: s.watchedSeconds,
          durationSec: s.durationSec,
          finishedAt: s.finishedAt,
        },
      }).catch(() => {});
    }

    function loadMeta(s: Session, attempt = 0): void {
      if (session !== s) return;
      const meta = readPlayerMeta(s.videoId, s.isShort);
      if (meta) {
        send({ type: 'updateVideoMeta', videoId: s.videoId, meta });
      } else if (attempt + 1 < META_RETRY_MS.length) {
        setTimeout(() => loadMeta(s, attempt + 1), META_RETRY_MS[attempt + 1]);
      } else {
        send({ type: 'updateVideoMeta', videoId: s.videoId, meta: readDomMeta(s.isShort) });
      }
    }

    /** Records the view once a condition (opened / playing) is met. */
    async function start(s: Session): Promise<void> {
      if (s.started || session !== s) return;
      if (s.isShort && !settings.recordShorts) return;
      await s.resume;
      // An unfinished view exists: decided by resumeOrStart once it plays.
      if (s.started || session !== s || s.prev) return;
      s.started = true;
      const res = await send({
        type: 'startView',
        videoId: s.videoId,
        title: pageTitle(),
        entry: s.entry,
        isShort: s.isShort,
        account: await currentAccount(),
        ...s.playlist,
      });
      s.viewId = res.viewId;
      flush(s); // progress collected before the view existed
      loadMeta(s);
      if (settings.cleanWatchLater === 'opened') watchLater.onWatched(s.videoId);
    }

    /**
     * Playback of a video with an unfinished view: starting about where it
     * stopped (YouTube resumes there) continues that view, however long ago;
     * starting over from further back is a new view.
     */
    function resumeOrStart(s: Session): void {
      const prev = s.prev!;
      s.prev = null;
      const stoppedAt = prev.lastPosition ?? prev.maxPosition ?? 0;
      if (stoppedAt >= RESUME_TOLERANCE_SEC && (s.playFrom ?? 0) < stoppedAt - RESUME_TOLERANCE_SEC) {
        start(s);
        return;
      }
      s.started = true;
      s.viewId = prev.id!;
      s.watchedSeconds += prev.watchedSeconds ?? 0;
      s.maxPosition = Math.max(s.maxPosition, prev.maxPosition ?? 0);
      s.dirty = true;
      flush(s);
      loadMeta(s);
    }

    function onNavigate(): void {
      if (prevUrl !== null && prevUrl !== location.href) {
        entry = entryFromPath(new URL(prevUrl).pathname);
      }
      prevUrl = location.href;
      updateWatchButton();
      const newPage = pageKind(location.pathname);
      if (newPage !== page) {
        // YouTube reuses cards across pages; hiding rules depend on the page.
        page = newPage;
        applySettingsClasses();
        scan(document);
      }
      const id = pageVideoId();
      if (id === session?.videoId) {
        bigPlayer.update(false);
        return;
      }
      bigPlayer.update(true);

      flush();
      session = null;
      if (!id) return;

      const isShort = location.pathname.startsWith('/shorts/');
      const s: Session = {
        videoId: id,
        isShort,
        started: false,
        viewId: null,
        maxPosition: 0,
        watchedSeconds: 0,
        lastTime: null,
        playFrom: null,
        dirty: false,
        entry,
        playlist: playlistFromUrl(location.href),
        // Shorts loop; every opening is a new view.
        resume: isShort ? Promise.resolve(null) : send({ type: 'resumableView', videoId: id }).catch(() => null),
        prev: null,
      };
      s.resume.then((v) => void (s.prev = v));
      session = s;
      if (settings.markOnOpen) setTimeout(() => start(s), settings.openDelayMs);
      if (!s.isShort) applyPlayerPrefs(id, () => settings);
    }

    // `timeupdate` does not bubble, so listen in the capture phase.
    document.addEventListener(
      'timeupdate',
      (e) => {
        const video = e.target;
        const s = session;
        if (!(video instanceof HTMLVideoElement) || !s) return;
        // Only the real player, not hover previews.
        if (!video.closest('ytd-watch-flexy, ytd-shorts')) return;
        // Ads: do not count their playback time.
        if (video.closest('.ad-showing')) {
          s.lastTime = null;
          return;
        }
        const t = video.currentTime;
        const delta = s.lastTime === null ? null : t - s.lastTime;
        // Normal playback advances in small steps; larger jumps are seeks.
        if (delta !== null && delta > 0 && delta < 3) s.watchedSeconds += delta;
        else if (delta !== 0) s.playFrom = t;
        s.lastTime = t;
        s.maxPosition = Math.max(s.maxPosition, t);
        if (Number.isFinite(video.duration) && video.duration > 0) s.durationSec = video.duration;
        s.dirty = true;

        if (s.prev && !s.started && s.watchedSeconds >= RESUME_CHECK_SEC) resumeOrStart(s);
        if (!s.started && settings.markOnPlay && s.watchedSeconds >= PLAYING_MIN_SEC) start(s);
        if (
          !s.finishedAt &&
          s.durationSec &&
          s.maxPosition / s.durationSec >= settings.finishedThreshold
        ) {
          s.finishedAt = Date.now();
          flush(s);
          if (settings.cleanWatchLater === 'finished') watchLater.onWatched(s.videoId);
        }
      },
      true,
    );

    // Channel trailers: paused when they start by themselves, not when the user starts them.
    // Paused on "playing" (first frame shown), not "play": stopped before its first
    // frame, the trailer stays black or YouTube does not show it at all.
    let trailerTouchedAt = 0;
    const onTrailerInput = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(CHANNEL_TRAILER_SELECTOR)) trailerTouchedAt = Date.now();
    };
    document.addEventListener('pointerdown', onTrailerInput, true);
    document.addEventListener('keydown', onTrailerInput, true);
    document.addEventListener(
      'playing',
      (e) => {
        const video = e.target;
        if (!settings.pauseChannelTrailer || !(video instanceof HTMLVideoElement)) return;
        if (!video.closest(CHANNEL_TRAILER_SELECTOR) || Date.now() - trailerTouchedAt < 3000) return;
        video.pause();
      },
      true,
    );

    document.addEventListener('pause', () => flush(), true);
    setInterval(() => flush(), FLUSH_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', () => flush());

    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('popstate', onNavigate);
    // The script starts before the page is built: the first video waits for it.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onNavigate, { once: true });
    else onNavigate();
  },
});
