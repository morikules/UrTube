import type { EntryPoint, Video } from './db';
import { locale } from './i18n';

/**
 * How sure it is that a video is music: 'sure' for YouTube Music plays (Takeout)
 * and auto-generated tracks of "Artist - Topic" channels (YouTube's raw channel
 * name, not translated), 'category' for YouTube's category "Music" (set by the
 * uploader, also language independent), otherwise null.
 */
export function musicKind(v: Pick<Video, 'isMusic' | 'channelName' | 'category'>): 'sure' | 'category' | null {
  if (v.isMusic || v.channelName?.endsWith(' - Topic')) return 'sure';
  return v.category === 'Music' ? 'category' : null;
}

export function isMusicVideo(v: Pick<Video, 'isMusic' | 'channelName' | 'category'>, withCategory: boolean): boolean {
  const kind = musicKind(v);
  return kind === 'sure' || (withCategory && kind === 'category');
}

const ID = '([\\w-]{11})';
const watchRe = new RegExp(`[?&]v=${ID}`);
const shortsRe = new RegExp(`/shorts/${ID}`);
const youtuBeRe = new RegExp(`youtu\\.be/${ID}`);

/** Extracts the video ID from a YouTube URL or relative href. */
/**
 * YouTube had no details for the video when asked (see metaFill): it no
 * longer exists under this ID (deleted, private or a broken ID from an import).
 */
export function isGone(v: { metaTriedAt?: number; metaUpdatedAt?: number }): boolean {
  return v.metaTriedAt !== undefined && !v.metaUpdatedAt;
}

/** Channel page from a channel key ("@handle" or "UC…"). */
export function channelUrl(key: string): string {
  return key.startsWith('@') ? `https://www.youtube.com/${key}` : `https://www.youtube.com/channel/${key}`;
}

/** Channel page of a video's channel, if known. */
export function videoChannelUrl(v: { channelHandle?: string; channelId?: string }): string | null {
  const key = v.channelHandle ?? v.channelId;
  return key ? channelUrl(key) : null;
}

export function videoIdFromUrl(url: string): string | null {
  const m = url.match(watchRe) ?? url.match(shortsRe) ?? url.match(youtuBeRe);
  return m?.[1] ?? null;
}

/**
 * Links to a playlist (`watch?v=…&list=…` without `index=`) point at the
 * playlist as a whole, not at its first video, and must not be marked.
 */
export function isPlaylistLink(href: string): boolean {
  return /[?&]list=/.test(href) && !/[?&]index=/.test(href);
}

/** Playlist context of a watch URL (`list=` and `index=`). */
export function playlistFromUrl(url: string): { playlistId?: string; playlistIndex?: number } {
  const params = new URL(url, 'https://www.youtube.com').searchParams;
  const list = params.get('list') ?? undefined;
  const index = Number(params.get('index'));
  return {
    playlistId: list,
    playlistIndex: list && Number.isInteger(index) && index > 0 ? index : undefined,
  };
}

/** Classifies the page a video was opened from by its pathname. */
export function entryFromPath(pathname: string): EntryPoint {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname.startsWith('/feed/subscriptions')) return 'subscriptions';
  if (pathname.startsWith('/feed/history')) return 'history';
  if (pathname === '/results') return 'search';
  if (pathname === '/watch') return 'watch';
  if (pathname.startsWith('/shorts/')) return 'shorts';
  if (pathname === '/playlist') return 'playlist';
  if (/^\/(@|channel\/|c\/|user\/)/.test(pathname)) return 'channel';
  return 'other';
}

/** Entry point for the first video of a page load, based on `document.referrer`. */
export function entryFromReferrer(referrer: string): EntryPoint {
  if (!referrer) return 'direct';
  try {
    const url = new URL(referrer);
    return /(^|\.)youtube\.com$/.test(url.hostname) ? entryFromPath(url.pathname) : 'external';
  } catch {
    return 'direct';
  }
}

/** Pages on which watched videos can be hidden ('watch' = recommendations next to a video). */
export type PageKind = 'subscriptions' | 'home' | 'channel' | 'playlist' | 'search' | 'watch' | 'other';

const PAGE_KINDS: readonly string[] = ['subscriptions', 'home', 'channel', 'playlist', 'search', 'watch'];

export function pageKind(pathname: string): PageKind {
  const entry = entryFromPath(pathname);
  return PAGE_KINDS.includes(entry) ? (entry as PageKind) : 'other';
}

const DAY_MS = 86_400_000;
const AGE_UNITS: [RegExp, number][] = [
  [/^(sekunde|second)/, 1000],
  [/^(minute)/, 60_000],
  [/^(stunde|hour)/, 3_600_000],
  [/^(tag|day)/, DAY_MS],
  [/^(woche|week)/, 7 * DAY_MS],
  [/^(monat|month)/, 30 * DAY_MS],
  [/^(jahr|year)/, 365 * DAY_MS],
];

/**
 * Age from YouTube's relative date, e.g. "vor 3 Tagen", "Gestreamt vor 2 Wochen",
 * "3 days ago". Returns milliseconds or null if the text is no such date.
 */
export function parseRelativeAge(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!/\bvor\b|\bago\b/.test(t)) return null;
  const m = t.match(/(\d+)\s*([a-zä]+)/);
  if (!m) return null;
  const unit = AGE_UNITS.find(([re]) => re.test(m[2]!));
  return unit ? Number(m[1]) * unit[1] : null;
}

/**
 * Stable key for a channel from a link or path: "/@Name/videos" → "@name",
 * "/channel/UC…" → "UC…". Null if it is no channel link.
 */
export function channelKeyFromPath(href: string): string | null {
  const path = new URL(href, 'https://www.youtube.com').pathname;
  const handle = path.match(/^\/(@[^/]+)/)?.[1];
  if (handle) return decodeURIComponent(handle).toLowerCase();
  return path.match(/^\/channel\/(UC[\w-]{22})/)?.[1] ?? null;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function videoUrl(videoId: string, isShort?: boolean): string {
  return isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
}

/** Formatters in the current language and the user's time zone (recreated when the language changes). */
let fmts: { locale: string; date: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat } | null = null;
function formatters() {
  const loc = locale();
  if (fmts?.locale !== loc) {
    fmts = {
      locale: loc,
      date: new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: '2-digit' }),
      dateTime: new Intl.DateTimeFormat(loc, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  }
  return fmts;
}

export function formatDate(ms: number): string {
  return formatters().date.format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return formatters().dateTime.format(new Date(ms));
}

/** 3725 → "1:02:05", 65 → "1:05" */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}
