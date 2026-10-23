/**
 * Statistics for the "Statistik" tab, computed from videos and views.
 * Pure functions, so they can be tested without a browser.
 */
import type { EntryPoint, Video, View } from './db';
import { locale, n, t } from './i18n';
import { videoChannelUrl } from './youtube';

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
  /** Where the label leads (channel page), if known. */
  url?: string;
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
  const channelUrls = new Map<string, string>();
  let unknownChannel = 0;
  let shorts = 0;
  for (const id of all) {
    const video = byId.get(id);
    if (video?.isShort) shorts++;
    if (video?.channelName) {
      channels.set(video.channelName, (channels.get(video.channelName) ?? 0) + 1);
      const url = videoChannelUrl(video);
      if (url && !channelUrls.has(video.channelName)) channelUrls.set(video.channelName, url);
    } else unknownChannel++;
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
      .map(([label, count]) => ({ label, count, url: channelUrls.get(label) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, topN),
    unknownChannel,
    entries: [...entries].map(([entry, count]) => ({ entry, count })).sort((a, b) => b.count - a.count),
  };
}

export interface RewatchedVideo {
  id: string;
  title: string;
  channelName?: string;
  count: number;
}

export interface Highlights {
  /** Videos watched more than once in the range, most views first. */
  rewatched: RewatchedVideo[];
  /** YouTube's categories of the videos watched in the range. */
  categories: CountRow[];
  unknownCategory: number;
  /** Longest run of days in a row with at least one watched video (in the range). */
  longestStreak: { days: number; from?: string; to?: string };
  /** Days in a row up to today (or yesterday, if nothing was watched today yet). */
  currentStreak: number;
  /** Day with the most videos in the range. */
  busiestDay?: { day: string; videos: number };
  /** New channels per bucket: channels whose first watched video falls into it. */
  newChannels: { key: string; label: string; channels: number }[];
  newChannelsTotal: number;
  /** First and last video watched in the range. */
  first?: { id: string; title: string; at: number };
  last?: { id: string; title: string; at: number };
  /** Total length of the distinct videos watched per channel (seconds), longest first. */
  channelTime: CountRow[];
  /** Channels with a watched video in the range. */
  channels: number;
}

/**
 * Further figures for the statistics and the year in review. Only views with
 * a real date count (imports without one say nothing about when).
 */
export function computeHighlights(
  videos: Video[],
  views: View[],
  range: StatsRange,
  buckets: { key: string; label: string }[],
  granularity: Granularity,
  topN = 10,
  now = Date.now(),
): Highlights {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const inRange = (at: number) => (range.from === null || at >= range.from) && at <= range.to;
  const dated = views.filter((v) => !v.dateUncertain);

  const viewsPerVideo = new Map<string, number>();
  const videosPerDay = new Map<string, Set<string>>();
  const allDays = new Set<string>();
  let first: View | undefined;
  let last: View | undefined;
  for (const v of dated) {
    allDays.add(dayKey(v.at));
    if (!inRange(v.at)) continue;
    viewsPerVideo.set(v.videoId, (viewsPerVideo.get(v.videoId) ?? 0) + 1);
    const day = dayKey(v.at);
    let set = videosPerDay.get(day);
    if (!set) videosPerDay.set(day, (set = new Set()));
    set.add(v.videoId);
    if (!first || v.at < first.at) first = v;
    if (!last || v.at > last.at) last = v;
  }

  // Length of all videos watched, per channel (each video once). Unlike the
  // figures above, "everything" also counts imports without a real date.
  const watchedIds = new Set(viewsPerVideo.keys());
  if (range.from === null) for (const v of views) if (v.dateUncertain) watchedIds.add(v.videoId);
  const time = new Map<string, { label: string; seconds: number; url?: string }>();
  for (const id of watchedIds) {
    const video = byId.get(id);
    if (!video?.channelName) continue;
    const key = video.channelId ?? video.channelName;
    const row = time.get(key) ?? { label: video.channelName, seconds: 0, url: videoChannelUrl(video) ?? undefined };
    row.seconds += video.durationSec ?? 0;
    time.set(key, row);
  }

  const rewatched = [...viewsPerVideo]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count, title: byId.get(id)?.title || id, channelName: byId.get(id)?.channelName }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, topN);

  const categories = new Map<string, number>();
  let unknownCategory = 0;
  for (const id of viewsPerVideo.keys()) {
    const category = byId.get(id)?.category;
    if (category) categories.set(category, (categories.get(category) ?? 0) + 1);
    else unknownCategory++;
  }

  // Streaks over calendar days (local time).
  const days = [...videosPerDay.keys()].sort();
  let longest = { days: 0, from: undefined as string | undefined, to: undefined as string | undefined };
  let run = 0;
  let runFrom = '';
  for (let i = 0; i < days.length; i++) {
    const consecutive = i > 0 && keyToUtc(days[i]!) - keyToUtc(days[i - 1]!) === DAY;
    run = consecutive ? run + 1 : 1;
    if (!consecutive) runFrom = days[i]!;
    if (run > longest.days) longest = { days: run, from: runFrom, to: days[i] };
  }
  let currentStreak = 0;
  let cursor = keyToUtc(dayKey(now));
  if (!allDays.has(dayKey(now))) cursor -= DAY; // today not started yet
  while (allDays.has(new Date(cursor).toISOString().slice(0, 10))) {
    currentStreak++;
    cursor -= DAY;
  }

  let busiestDay: Highlights['busiestDay'];
  for (const [day, set] of videosPerDay) {
    if (!busiestDay || set.size > busiestDay.videos) busiestDay = { day, videos: set.size };
  }

  // New channels: the first watched video of each channel (all time) decides when it was new.
  const channelFirst = new Map<string, number>();
  for (const v of dated) {
    const video = byId.get(v.videoId);
    const channel = video?.channelId ?? video?.channelName;
    if (!channel) continue;
    const known = channelFirst.get(channel);
    if (known === undefined || v.at < known) channelFirst.set(channel, v.at);
  }
  const perBucket = new Map<string, number>();
  let newChannelsTotal = 0;
  for (const at of channelFirst.values()) {
    if (!inRange(at)) continue;
    newChannelsTotal++;
    const key = bucketKey(at, granularity);
    perBucket.set(key, (perBucket.get(key) ?? 0) + 1);
  }

  return {
    rewatched,
    categories: [...categories]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, topN),
    unknownCategory,
    longestStreak: longest,
    currentStreak,
    busiestDay,
    newChannels: buckets.map((b) => ({ ...b, channels: perBucket.get(b.key) ?? 0 })),
    newChannelsTotal,
    first: first && { id: first.videoId, title: byId.get(first.videoId)?.title || first.videoId, at: first.at },
    last: last && { id: last.videoId, title: byId.get(last.videoId)?.title || last.videoId, at: last.at },
    channelTime: [...time.values()]
      .filter((r) => r.seconds > 0)
      .map((r) => ({ label: r.label, count: r.seconds, url: r.url }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, topN),
    channels: time.size,
  };
}

/** Years with dated views, newest first (for the year in review). */
export function yearsWithViews(views: View[]): number[] {
  const years = new Set<number>();
  for (const v of views) if (!v.dateUncertain) years.add(new Date(v.at).getFullYear());
  return [...years].sort((a, b) => b - a);
}

/** A whole calendar year as a range (up to now for the current year). */
export function yearRange(year: number, now = new Date()): StatsRange {
  const end = new Date(year + 1, 0, 1).getTime() - 1;
  return { from: new Date(year, 0, 1).getTime(), to: Math.min(end, now.getTime()) };
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
