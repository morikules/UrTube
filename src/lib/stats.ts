/**
 * Statistics for the "Statistik" tab, computed from videos and views.
 * Pure functions, so they can be tested without a browser.
 */
import type { EntryPoint, Video, View } from './db';
import { locale, n, t } from './i18n';

export interface StatsRange {
  /** Inclusive start (ms) or null for "everything". */
  from: number | null;
  /** Inclusive end (ms). */
  to: number;
}

/** Size of one column in the chart; chosen from the length of the range. */
export type Granularity = 'day' | 'week' | 'month';

export interface Bucket {
  /** "2026-10-13" (day/week start) or "2026-10" (month) */
  key: string;
  /** Short label like "13.10." or "Okt 26". */
  label: string;
  /** Distinct videos watched in that period. */
  videos: number;
}

export interface CountRow {
  label: string;
  count: number;
}

export interface WatchStats {
  /** Distinct videos with a view in the range (for "everything" incl. undated ones). */
  videos: number;
  /**
   * Videos counted although their only views have no real date (bulk imports).
   * They appear in the totals of "everything", never in the time line.
   */
  undatedVideos: number;
  views: number;
  /** Seconds actually played (only sessions recorded by the extension). */
  watchedSeconds: number;
  /** Sessions recorded by the extension, and how many of them reached "finished". */
  sessions: number;
  finished: number;
  shorts: number;
  granularity: Granularity;
  buckets: Bucket[];
  topChannels: CountRow[];
  /** Videos in the range whose channel is unknown (e.g. old Watchmarker imports). */
  unknownChannel: number;
  entries: { entry: EntryPoint; count: number }[];
}

const dayFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY = 86_400_000;

/** "2026-10-13" in the user's time zone. */
const dayKey = (ms: number) => dayFmt.format(new Date(ms));
/** Midnight UTC of a day key – used to step through days without time-zone surprises. */
const keyToUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);

/** Monday of the week of a day key. */
function weekKey(day: string): string {
  const t = keyToUtc(day);
  const weekday = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - weekday * DAY).toISOString().slice(0, 10);
}

function bucketKey(ms: number, g: Granularity): string {
  const day = dayKey(ms);
  return g === 'day' ? day : g === 'week' ? weekKey(day) : day.slice(0, 7);
}

/** "13.10." / "10/13" for days and weeks, "Okt 26" / "Oct 26" for months. */
function bucketLabel(key: string, g: Granularity): string {
  if (g === 'month') {
    const fmt = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: 'short', year: '2-digit' });
    return fmt.format(new Date(`${key}-15T00:00:00Z`)).replace('.', '');
  }
  return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

/** Short ranges per day, medium per week, long per month. */
export function granularityFor(from: number, to: number): Granularity {
  const days = (to - from) / DAY;
  return days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
}

/** All buckets from start to end, so empty periods show as 0. */
function bucketsBetween(from: number, to: number, g: Granularity): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const last = bucketKey(to, g);
  let t = keyToUtc(dayKey(from));
  for (let i = 0; i < 5000; i++) {
    const key = g === 'day' ? new Date(t).toISOString().slice(0, 10) : bucketKey(t + DAY / 2, g);
    if (out.at(-1)?.key !== key) out.push({ key, label: bucketLabel(key, g) });
    if (key === last) break;
    t += DAY;
  }
  return out;
}

export function computeStats(videos: Video[], views: View[], range: StatsRange, topN = 10): WatchStats {
  const everything = range.from === null;
  const inRange = (at: number) => (range.from === null || at >= range.from) && at <= range.to;
  const byId = new Map(videos.map((v) => [v.id, v]));

  const dated = new Set<string>();
  const undated = new Set<string>();
  const entries = new Map<EntryPoint, number>();
  const datedViews: View[] = [];
  let viewCount = 0;
  let watchedSeconds = 0;
  let sessions = 0;
  let finished = 0;
  let first = Infinity;

  for (const v of views) {
    if (v.dateUncertain) {
      // Bulk-import dates are not real watch dates: only part of "everything".
      if (everything) {
        undated.add(v.videoId);
        viewCount++;
      }
      continue;
    }
    if (!inRange(v.at)) continue;
    viewCount++;
    dated.add(v.videoId);
    datedViews.push(v);
    first = Math.min(first, v.at);
    if (v.kind === 'watch') {
      sessions++;
      if (v.finishedAt) finished++;
      watchedSeconds += v.watchedSeconds ?? 0;
      if (v.entry) entries.set(v.entry, (entries.get(v.entry) ?? 0) + 1);
    }
  }
  const all = new Set([...dated, ...undated]);
  const undatedVideos = [...undated].filter((id) => !dated.has(id)).length;

  const channels = new Map<string, number>();
  let unknownChannel = 0;
  let shorts = 0;
  for (const id of all) {
    const video = byId.get(id);
    if (video?.isShort) shorts++;
    if (video?.channelName) channels.set(video.channelName, (channels.get(video.channelName) ?? 0) + 1);
    else unknownChannel++;
  }

  const start = range.from ?? (Number.isFinite(first) ? first : range.to);
  // "Everything" is always shown per month, however short the recorded time is.
  const granularity = everything ? 'month' : granularityFor(start, range.to);
  const perBucket = new Map<string, Set<string>>();
  for (const v of datedViews) {
    const key = bucketKey(v.at, granularity);
    let set = perBucket.get(key);
    if (!set) perBucket.set(key, (set = new Set()));
    set.add(v.videoId);
  }
  const buckets = bucketsBetween(start, range.to, granularity).map((b) => ({
    ...b,
    videos: perBucket.get(b.key)?.size ?? 0,
  }));

  return {
    videos: all.size,
    undatedVideos,
    views: viewCount,
    watchedSeconds,
    sessions,
    finished,
    shorts,
    granularity,
    buckets,
    topChannels: [...channels]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, topN),
    unknownChannel,
    entries: [...entries].map(([entry, count]) => ({ entry, count })).sort((a, b) => b.count - a.count),
  };
}

/** 9.5 h → "9 h 30 min", 125 h → "5 days 5 h" */
export function formatWatchTime(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return t.stats.minutes(n(min));
  const h = Math.floor(min / 60);
  if (h < 48) return t.stats.hours(n(h), String(min % 60));
  return t.stats.days(n(Math.floor(h / 24)), String(h % 24));
}

export type RangeId =
  | '7d'
  | '30d'
  | 'thisMonth'
  | 'lastMonth'
  | '3m'
  | '6m'
  | '12m'
  | 'thisYear'
  | 'lastYear'
  | 'all';

export const RANGE_IDS: RangeId[] = ['7d', '30d', 'thisMonth', 'lastMonth', '3m', '6m', '12m', 'thisYear', 'lastYear', 'all'];

/**
 * Start and end of a range in local time (the browser runs in the user's
 * time zone). Month ranges start on the 1st: "letzte 3 Monate" = this month
 * and the two before.
 */
export function rangeFor(id: RangeId, now = new Date()): StatsRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const startOfDay = new Date(y, m, now.getDate()).getTime();
  const to = now.getTime();
  switch (id) {
    case '7d':
      return { from: startOfDay - 6 * DAY, to };
    case '30d':
      return { from: startOfDay - 29 * DAY, to };
    case 'thisMonth':
      return { from: new Date(y, m, 1).getTime(), to };
    case 'lastMonth':
      return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() - 1 };
    case '3m':
      return { from: new Date(y, m - 2, 1).getTime(), to };
    case '6m':
      return { from: new Date(y, m - 5, 1).getTime(), to };
    case '12m':
      return { from: new Date(y, m - 11, 1).getTime(), to };
    case 'thisYear':
      return { from: new Date(y, 0, 1).getTime(), to };
    case 'lastYear':
      return { from: new Date(y - 1, 0, 1).getTime(), to: new Date(y, 0, 1).getTime() - 1 };
    case 'all':
      return { from: null, to };
  }
}
