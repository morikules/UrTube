/**
 * Parsing YouTube's watch history (browse endpoint "FEhistory").
 * The history is grouped into sections per day ("Heute", "Gestern",
 * "Montag", "12. Okt.", "12. Okt. 2024"); times are not available.
 */
import { findContinuation, isObj, text, type Json } from './ytjson';

export interface HistoryItem {
  videoId: string;
  title?: string;
  isShort?: boolean;
  /** Calendar day (local time, YYYY-MM-DD) or null if the header was not understood. */
  day: string | null;
  /** Token of the "remove from watch history" menu entry. */
  removalToken?: string;
}

export interface HistoryPage {
  items: HistoryItem[];
  continuation?: string;
  /** Section headers that could not be read as a date (for diagnosis). */
  unknownHeaders: string[];
  /** Shortened structure of a video without removal token (for diagnosis). */
  missingTokenSample?: string;
}

/** Progress of a sync, stored in storage.local under `youtubeHistorySync`. */
export interface SyncStatus {
  running: boolean;
  full: boolean;
  startedAt: number;
  /** Updated after every page; a run without heartbeat for a while is considered dead. */
  heartbeat: number;
  pages: number;
  items: number;
  added: number;
  finishedAt?: number;
  error?: string;
  /** Day headers that could not be read (first few). */
  unknownHeaders?: string[];
  /** Videos for which a removal token was found. */
  tokens?: number;
  missingTokenSample?: string;
  /** Stopped by the user ("Abbrechen"). */
  cancelled?: boolean;
}

export const SYNC_STATUS_KEY = 'youtubeHistorySync';
/** Timestamp written by "Abbrechen"; a running sync started before it stops. */
export const SYNC_CANCEL_KEY = 'youtubeHistorySyncCancel';

/** Result of the last removal run, stored in storage.local under REMOVAL_RESULT_KEY. */
export interface RemovalResult {
  at: number;
  removed: number;
  notFound: number;
  failed: number;
  error?: string;
}

export const REMOVAL_RESULT_KEY = 'youtubeRemovalResult';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mär: 3, mar: 3, märz: 3, apr: 4, mai: 5, may: 5, jun: 6, juni: 6,
  jul: 7, juli: 7, aug: 8, sep: 9, sept: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};
const WEEKDAYS: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// The headers ("Today", "Monday") refer to the user's local days.
const localDay = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });
const localWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

function dayOf(ms: number): string {
  return localDay.format(new Date(ms));
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Converts a section header to a day key, relative to `now`. */
export function parseSectionDate(text: string, now: number): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'heute' || t === 'today') return dayOf(now);
  if (t === 'gestern' || t === 'yesterday') return dayOf(now - DAY_MS);

  if (t in WEEKDAYS) {
    const today = WEEKDAYS[localWeekday.format(new Date(now)).toLowerCase()]!;
    const back = (today - WEEKDAYS[t]! + 7) % 7 || 7;
    return dayOf(now - back * DAY_MS);
  }

  const numeric = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (numeric) return `${numeric[3]}-${pad(Number(numeric[2]))}-${pad(Number(numeric[1]))}`;

  // "12. okt." / "12. okt. 2024" (German) or "oct 12" / "oct 12, 2024" (English)
  const de = t.match(/^(\d{1,2})\.\s*([a-zä]+)\.?(?:\s+(\d{4}))?$/);
  const en = t.match(/^([a-z]+)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  const [dayStr, monthStr, yearStr] = de ? [de[1], de[2], de[3]] : en ? [en[2], en[1], en[3]] : [];
  if (!dayStr || !monthStr) return null;
  const month = MONTHS[monthStr] ?? MONTHS[monthStr.slice(0, 3)];
  if (!month) return null;
  const currentYear = Number(dayOf(now).slice(0, 4));
  let year = yearStr ? Number(yearStr) : currentYear;
  // Without a year the date lies in the past; a future date means last year.
  if (!yearStr && `${year}-${pad(month)}-${pad(Number(dayStr))}` > dayOf(now)) year--;
  return `${year}-${pad(month)}-${pad(Number(dayStr))}`;
}

const ID_RE = /^[\w-]{11}$/;

/** Reads a video from one of YouTube's renderer shapes (old and new layouts). */
function videoFrom(key: string, v: Json): Omit<HistoryItem, 'day'> | null {
  if (key === 'videoRenderer' && typeof v.videoId === 'string') {
    return { videoId: v.videoId, title: text(v.title) };
  }
  if (key === 'reelItemRenderer' && typeof v.videoId === 'string') {
    return { videoId: v.videoId, title: text(v.headline), isShort: true };
  }
  if (key === 'lockupViewModel' && typeof v.contentId === 'string' && v.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
    const meta = (v.metadata as Json | undefined)?.lockupMetadataViewModel as Json | undefined;
    return { videoId: v.contentId, title: text(meta?.title) };
  }
  if (key === 'shortsLockupViewModel') {
    const cmd = ((v.onTap as Json | undefined)?.innertubeCommand as Json | undefined)?.reelWatchEndpoint as
      | Json
      | undefined;
    const id = typeof cmd?.videoId === 'string' ? cmd.videoId : String(v.entityId ?? '').split('-').pop();
    const overlay = v.overlayMetadata as Json | undefined;
    return id ? { videoId: id, title: text(overlay?.primaryText), isShort: true } : null;
  }
  return null;
}

/** Menu entries in old (menuServiceItemRenderer) and new (listItemViewModel) layouts. */
const MENU_ITEM_KEYS = new Set(['listItemViewModel', 'menuServiceItemRenderer', 'menuNavigationItemRenderer']);

/**
 * Token of the "remove from watch history" menu entry below `node`. The menu
 * may hold several feedback entries; the right one carries the "DELETE" icon
 * (as Watchmarker does). A single feedback entry without icon is accepted too.
 */
export function findRemovalToken(node: unknown): string | undefined {
  const found: { token: string; isDelete: boolean }[] = [];
  const walk = (n: unknown, menuItem: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x, menuItem);
      return;
    }
    if (!isObj(n)) return;
    const fb = n.feedbackEndpoint;
    if (isObj(fb) && typeof fb.feedbackToken === 'string') {
      found.push({
        token: fb.feedbackToken,
        isDelete: menuItem !== undefined && JSON.stringify(menuItem).includes('"DELETE"'),
      });
    }
    for (const [key, value] of Object.entries(n)) {
      walk(value, MENU_ITEM_KEYS.has(key) ? value : menuItem);
    }
  };
  walk(node, undefined);
  return (found.find((f) => f.isDelete) ?? (found.length === 1 ? found[0] : undefined))?.token;
}

/**
 * Copy of `node` for diagnosis: long strings cut, deep levels and long lists
 * shortened, so it shows the structure without much content.
 */
export function shorten(node: unknown, depth = 0): unknown {
  if (typeof node === 'string') return node.length > 60 ? `${node.slice(0, 60)}…` : node;
  if (depth > 14) return '…';
  if (Array.isArray(node)) return node.slice(0, 4).map((n) => shorten(n, depth + 1));
  if (isObj(node)) {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, shorten(v, depth + 1)]));
  }
  return node;
}

/** Collects all videos below `node`; `missing` gets renderers without removal token. */
function collectVideos(node: unknown, out: Omit<HistoryItem, 'day'>[], missing: Json[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectVideos(n, out, missing);
    return;
  }
  if (!isObj(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (!isObj(value)) continue;
    const video = videoFrom(key, value);
    if (video && ID_RE.test(video.videoId)) {
      const removalToken = findRemovalToken(value);
      if (removalToken) out.push({ ...video, removalToken });
      else {
        out.push(video);
        if (!missing.length) missing.push({ [key]: value });
      }
      continue;
    }
    collectVideos(value, out, missing);
  }
}

/** Finds all day sections (itemSectionRenderer) in a browse response. */
function findSections(node: unknown, out: Json[]): void {
  if (Array.isArray(node)) {
    for (const n of node) findSections(n, out);
    return;
  }
  if (!isObj(node)) return;
  if (isObj(node.itemSectionRenderer)) {
    out.push(node.itemSectionRenderer);
    return;
  }
  for (const value of Object.values(node)) findSections(value, out);
}

/** Extracts videos with their day and the token for the next page. */
export function extractHistoryPage(response: unknown, now: number): HistoryPage {
  const sections: Json[] = [];
  findSections(response, sections);
  const items: HistoryItem[] = [];
  const unknownHeaders: string[] = [];
  const missing: Json[] = [];
  for (const section of sections) {
    const header = section.header as Json | undefined;
    const title = text((header?.itemSectionHeaderRenderer as Json | undefined)?.title);
    const day = title ? parseSectionDate(title, now) : null;
    if (!day) unknownHeaders.push(title ?? `(ohne Überschrift: ${Object.keys(header ?? {}).join(', ') || '–'})`);
    const videos: Omit<HistoryItem, 'day'>[] = [];
    collectVideos(section.contents, videos, missing);
    const seen = new Set<string>();
    for (const v of videos) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      items.push({ ...v, day });
    }
  }
  return {
    items,
    continuation: findContinuation(response),
    unknownHeaders,
    missingTokenSample: missing.length ? JSON.stringify(shorten(missing[0])) : undefined,
  };
}

/**
 * Timestamp used for a history item: midday of its day (11:00 UTC is 12:00
 * or 13:00 in Berlin), but not later than `now` for today's entries.
 */
export function dayToTimestamp(day: string, now: number): number {
  return Math.min(Date.parse(`${day}T11:00:00Z`), now);
}
