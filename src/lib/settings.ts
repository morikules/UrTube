import type { LanguagePref } from './i18n';

export interface Settings {
  // --- When a video counts as watched ---
  /** Video page was open for a moment. */
  markOnOpen: boolean;
  /** Player actually started playing. */
  markOnPlay: boolean;
  /** YouTube shows its red progress bar on the thumbnail. */
  markFromProgressBar: boolean;
  /** Video appears in the Firefox history (needs the "history" permission). */
  markFromBrowserHistory: boolean;
  /** Video appears in the YouTube watch history (incl. phone/TV). */
  markFromYoutubeHistory: boolean;
  /** Deleting a video also removes it from the YouTube watch history. */
  removeFromYoutubeHistory: boolean;
  /** Share of the video (0–1) that must be played to count as finished. */
  finishedThreshold: number;
  /** Record tracks played on music.youtube.com (only recorded, nothing is hidden there). */
  recordYoutubeMusic: boolean;
  /** Mark tracks already heard/watched in lists on music.youtube.com (never hidden). */
  markOnYoutubeMusic: boolean;
  /** Record Shorts at all (opening, progress bar, history syncs). */
  recordShorts: boolean;
  /** Time on a video page before it counts as opened. */
  openDelayMs: number;
  /** Interval of the automatic browser/YouTube history sync. */
  syncIntervalMin: number;
  /** Ask YouTube for channel, length and date of recent videos known without them. */
  fetchMissingMeta: boolean;
  /** … also for all older videos (Watchmarker import), slowly in the background. */
  fetchMissingMetaAll: boolean;
  /** Remove watched videos from "Watch later": never, once opened, or once finished. */
  cleanWatchLater: 'off' | 'opened' | 'finished';

  // --- How watched videos look on YouTube ---
  fadeWatched: boolean;
  grayscaleWatched: boolean;
  showBadge: boolean;
  showBadgeDate: boolean;
  /** Hide YouTube's red progress bar on watched thumbnails. */
  hideProgressBar: boolean;
  /** Eye button on thumbnails and the video page to toggle watched. */
  showEyeButton: boolean;
  /** Number of hidden videos next to the switch in the YouTube header. */
  showHiddenCount: boolean;
  /** Hiding with ⊘, separately for videos, playlists and channels (button + effect). */
  dismissVideos: boolean;
  dismissPlaylists: boolean;
  dismissChannels: boolean;
  /** Items hidden with ⊘ stay hidden while the header switch is off (watched ones are then shown). */
  dismissAlwaysHidden: boolean;
  /** "12 / 23 gesehen" on playlist thumbnails. */
  showPlaylistProgress: boolean;
  /** Watched / total videos, Shorts, live streams and playlists in a channel's header. */
  showChannelStats: boolean;

  // --- Hiding (switch in the YouTube header) ---
  /** State of the header switch "hide watched" (one switch for all areas). */
  hideEnabled: boolean;
  /** One switch for everything, or one per area (the switch on a page then toggles its area). */
  hideSwitchMode: 'global' | 'perArea';
  /** State of the switch per area, used with hideSwitchMode 'perArea'. */
  hideAreas: Record<HideArea, boolean>;
  hideOnSubscriptions: boolean;
  /** Only hide watched videos published within this many days (0 = no limit). */
  hideWindowSubscriptions: number;
  hideOnHome: boolean;
  hideWindowHome: number;
  hideOnChannels: boolean;
  hideWindowChannels: number;
  /** Watched videos inside a playlist (playlist page), without time limit. */
  hideOnPlaylists: boolean;
  /** Watched videos in search results. */
  hideOnSearch: boolean;
  /** Watched videos in the recommendations next to a video. */
  hideOnSidebar: boolean;
  /** Never hide videos played in YouTube Music (they are still marked). */
  keepMusicVisible: boolean;
  /** Videos in YouTube's category "Music" count as music too (less exact). */
  musicFromCategory: boolean;
  /** How long read playlists are kept before they are read again. */
  playlistCacheHours: number;
  /** Content filters on the subscriptions page. */
  filterShorts: boolean;
  filterPremieres: boolean;
  filterLive: boolean;
  filterMembersOnly: boolean;
  /** The members-only filter also applies on channel pages. */
  filterMembersOnlyOnChannels: boolean;
  /** Leave members-only videos out of the channel statistics. */
  hideMembersInChannelStats: boolean;
  filterMostRelevant: boolean;
  /** The content filters (Shorts, premieres, live streams, members only) also on the home page. */
  filtersOnHome: boolean;
  /** … and among the recommendations next to a video. */
  filtersOnSidebar: boolean;
  /** Hide playlists whose videos were all watched. */
  hidePlaylistsDone: boolean;
  /** Delay before newly loaded videos are processed; higher saves resources. */
  scanDelayMs: number;

  // --- Video page: big player (like the userscript "Youtube Fullscreen Mode") ---
  /** Player fills the window height in theater mode. */
  bigPlayer: boolean;
  /** Switch to theater mode automatically when a video opens. */
  bigPlayerAutoTheater: boolean;
  /** Header hidden until the mouse goes to the top edge. */
  bigPlayerHideHeader: boolean;
  /** The hidden header also appears together with the player's controls. */
  bigPlayerHeaderWithControls: boolean;
  /** Comments and recommendations hidden while at the top, shown when scrolling. */
  bigPlayerFocus: boolean;

  // --- Preferred playback, applied once when a video starts ---
  /** 'auto' = leave it to YouTube, 'max' = best available, otherwise at most this quality. */
  playerQuality: PlayerQuality;
  /** Playback speed; 0 = leave unchanged. */
  playerSpeed: number;
  /** Subtitles: leave as YouTube decides, always off, or on in the preferred language. */
  playerCaptions: 'keep' | 'off' | 'on';
  /** Preferred subtitle language (ISO code, e.g. "de"); falls back to any available. */
  playerCaptionLang: string;
  /** Pause the trailer that starts by itself on a channel's home page. */
  pauseChannelTrailer: boolean;
  /** Collapse the chat next to live streams (and their replays) when the video opens. */
  hideLiveChat: boolean;

  /** Color scheme of the add-on's own pages. */
  uiTheme: 'system' | 'light' | 'dark';
  /** Language of the add-on pages and its buttons on YouTube; 'auto' follows the browser. */
  language: LanguagePref;
}

/** Areas with their own hide switch: "other" are search results and the sidebar next to a video. */
export const HIDE_AREAS = ['subscriptions', 'home', 'channel', 'playlist', 'other'] as const;
export type HideArea = (typeof HIDE_AREAS)[number];

/** The area of a page kind (see youtube.ts pageKind); null where nothing is hidden. */
export function hideAreaOf(page: string): HideArea | null {
  if (page === 'search' || page === 'watch') return 'other';
  return (HIDE_AREAS as readonly string[]).includes(page) ? (page as HideArea) : null;
}

/** Whether the switch is on for this page. */
export function isHidingOn(s: Settings, page: string): boolean {
  if (s.hideSwitchMode === 'global') return s.hideEnabled;
  const area = hideAreaOf(page);
  return area ? s.hideAreas[area] : s.hideEnabled;
}

/** Settings with the switch of this page flipped (its area, or the global one). */
export function toggleHiding(s: Settings, page: string): Settings {
  const area = s.hideSwitchMode === 'perArea' ? hideAreaOf(page) : null;
  if (!area) return { ...s, hideEnabled: !s.hideEnabled };
  return { ...s, hideAreas: { ...s.hideAreas, [area]: !s.hideAreas[area] } };
}

/** YouTube's quality names, best first. */
export const QUALITY_LEVELS = [
  'highres',
  'hd2880',
  'hd2160',
  'hd1440',
  'hd1080',
  'hd720',
  'large',
  'medium',
  'small',
  'tiny',
] as const;
export type PlayerQuality = 'auto' | 'max' | (typeof QUALITY_LEVELS)[number];

/** Defaults for new installs; conservative since v1.0 (see LEGACY_DEFAULTS). */
export const defaultSettings: Settings = {
  markOnOpen: true,
  markOnPlay: true,
  markFromProgressBar: true,
  markFromBrowserHistory: false,
  markFromYoutubeHistory: false,
  removeFromYoutubeHistory: false,
  finishedThreshold: 0.9,
  recordShorts: true,
  recordYoutubeMusic: true,
  markOnYoutubeMusic: true,
  openDelayMs: 2000,
  syncIntervalMin: 60,
  fetchMissingMeta: true,
  fetchMissingMetaAll: false,
  cleanWatchLater: 'off',
  fadeWatched: true,
  grayscaleWatched: true,
  showBadge: true,
  showBadgeDate: true,
  hideProgressBar: false,
  showEyeButton: true,
  showHiddenCount: false,
  dismissVideos: true,
  dismissPlaylists: true,
  dismissChannels: true,
  dismissAlwaysHidden: false,
  showPlaylistProgress: true,
  showChannelStats: true,
  hideEnabled: true,
  hideSwitchMode: 'global',
  hideAreas: { subscriptions: true, home: true, channel: true, playlist: true, other: true },
  hideOnSubscriptions: true,
  hideWindowSubscriptions: 30,
  hideOnHome: true,
  hideWindowHome: 0,
  hideOnChannels: true,
  hideWindowChannels: 30,
  hideOnPlaylists: true,
  hideOnSearch: false,
  hideOnSidebar: false,
  keepMusicVisible: false,
  musicFromCategory: true,
  playlistCacheHours: 24,
  filterShorts: false,
  filterPremieres: false,
  filterLive: false,
  filterMembersOnly: false,
  filterMembersOnlyOnChannels: false,
  hideMembersInChannelStats: false,
  filterMostRelevant: false,
  filtersOnHome: false,
  filtersOnSidebar: false,
  hidePlaylistsDone: true,
  scanDelayMs: 100,
  bigPlayer: false,
  bigPlayerAutoTheater: true,
  bigPlayerHideHeader: true,
  bigPlayerHeaderWithControls: true,
  bigPlayerFocus: true,
  playerQuality: 'auto',
  playerSpeed: 0,
  playerCaptions: 'keep',
  playerCaptionLang: 'en',
  pauseChannelTrailer: false,
  hideLiveChat: false,
  uiTheme: 'system',
  language: 'auto',
};

/** Defaults before v1.0; kept for installs that already have stored settings. */
const LEGACY_DEFAULTS: Partial<Settings> = {
  removeFromYoutubeHistory: true,
  filterShorts: true,
  bigPlayer: true,
  playerCaptionLang: 'de',
};

/**
 * The quality to request: 'max' takes the best available, a fixed level the
 * best available that is not higher. Null = leave it to YouTube.
 */
export function pickQuality(pref: PlayerQuality, available: readonly string[]): string | null {
  if (pref === 'auto') return null;
  const order: readonly string[] = QUALITY_LEVELS;
  const start = pref === 'max' ? 0 : order.indexOf(pref);
  return order.slice(start).find((q) => available.includes(q)) ?? null;
}

export function normalizeSettings(stored: unknown): Settings {
  const s = { ...(stored as Partial<Settings> & { markWatched?: boolean; showDismissButton?: boolean }) };
  // v0.1 had a single switch for all marking.
  if (s.markWatched === false) {
    s.fadeWatched ??= false;
    s.grayscaleWatched ??= false;
    s.showBadge ??= false;
  }
  delete s.markWatched;
  // v0.5 had one switch for the ⊘ button.
  if (s.showDismissButton === false) {
    s.dismissVideos ??= false;
    s.dismissPlaylists ??= false;
    s.dismissChannels ??= false;
  }
  delete s.showDismissButton;
  // Existing installs keep what they had; only new installs get the v1.0 defaults.
  const legacy = stored && typeof stored === 'object' && Object.keys(stored).length ? LEGACY_DEFAULTS : {};
  const base: Settings = { ...defaultSettings, ...legacy };
  // Only known settings of the right kind (e.g. from a backup file); numbers finite and not negative.
  const merged = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) {
    const def = (base as unknown as Record<string, unknown>)[k];
    if (def === undefined || typeof v !== typeof def || (def !== null && typeof def === 'object')) continue;
    if (typeof v === 'number' && !(Number.isFinite(v) && v >= 0)) continue;
    merged[k] = v;
  }
  const result = merged as unknown as Settings;
  if (result.syncIntervalMin < 1) result.syncIntervalMin = base.syncIntervalMin;
  // Areas added later get their default.
  result.hideAreas = { ...defaultSettings.hideAreas };
  if (s.hideAreas && typeof s.hideAreas === 'object') {
    for (const area of Object.keys(result.hideAreas) as (keyof Settings['hideAreas'])[]) {
      const on = (s.hideAreas as Record<string, unknown>)[area];
      if (typeof on === 'boolean') result.hideAreas[area] = on;
    }
  }
  return result;
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  return normalizeSettings(settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

/** Calls `fn` whenever the settings are changed (e.g. on the options page). */
export function onSettingsChanged(fn: (s: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) fn(normalizeSettings(changes.settings.newValue));
  });
}
