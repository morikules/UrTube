/**
 * Reading and merging YouTube Watchmarker database exports.
 *
 * Export format: base64-encoded UTF-8 JSON array of
 * { strIdent: videoId, intTimestamp: ms since epoch, strTitle, intCount }.
 * Watchmarker keeps only the latest watch timestamp per video, so merging
 * several exports recovers earlier watch times as separate views.
 */

import { t } from './i18n';

export interface WatchmarkerEntry {
  strIdent: string;
  intTimestamp: number;
  strTitle: string;
  intCount: number;
}

export interface MergedVideo {
  id: string;
  title: string;
  /** Distinct watch timestamps across all exports, ascending. */
  timestamps: number[];
  /** Highest intCount seen in any export. */
  watchmarkerCount: number;
}

export interface MergeResult {
  videos: MergedVideo[];
  /** Calendar days (local time, YYYY-MM-DD) treated as bulk imports. */
  bulkDays: Set<string>;
}

/**
 * A day with at least this many entries cannot be real watching; it comes from
 * a bulk action (e.g. Watchmarker importing the YouTube history). Timestamps on
 * such days are marked as uncertain.
 */
export const BULK_DAY_THRESHOLD = 500;

/** Calendar day in the user's time zone. */
const localDay = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });

export function dayKey(ms: number): string {
  return localDay.format(new Date(ms));
}

export function parseExport(text: string): WatchmarkerEntry[] {
  const binary = atob(text.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const data: unknown = JSON.parse(new TextDecoder('utf-8').decode(bytes));
  if (!Array.isArray(data)) throw new Error(t.errors.notAList);
  const entries: WatchmarkerEntry[] = [];
  data.forEach((row, i) => {
    if (
      typeof row?.strIdent !== 'string' ||
      typeof row?.intTimestamp !== 'number'
    ) {
      throw new Error(t.errors.wmInvalid(i));
    }
    // Entries that are no video or have no real time are skipped.
    if (!VIDEO_ID.test(row.strIdent) || !Number.isFinite(row.intTimestamp) || row.intTimestamp <= 0) return;
    entries.push({
      strIdent: row.strIdent,
      intTimestamp: row.intTimestamp,
      strTitle: typeof row.strTitle === 'string' ? row.strTitle : '',
      intCount: Number.isFinite(row.intCount) && row.intCount > 0 ? row.intCount : 1,
    });
  });
  return entries;
}

const VIDEO_ID = /^[\w-]{11}$/;

export function mergeExports(exports: WatchmarkerEntry[][]): MergeResult {
  const byId = new Map<
    string,
    { title: string; titleTs: number; ts: Set<number>; count: number }
  >();
  for (const entries of exports) {
    for (const e of entries) {
      let v = byId.get(e.strIdent);
      if (!v) {
        v = { title: e.strTitle, titleTs: e.intTimestamp, ts: new Set(), count: 0 };
        byId.set(e.strIdent, v);
      }
      v.ts.add(e.intTimestamp);
      v.count = Math.max(v.count, e.intCount);
      // Title of the most recent watch wins (channels rename videos).
      if (e.intTimestamp >= v.titleTs && e.strTitle) {
        v.title = e.strTitle;
        v.titleTs = e.intTimestamp;
      }
    }
  }

  const perDay = new Map<string, number>();
  const videos: MergedVideo[] = [];
  for (const [id, v] of byId) {
    const timestamps = [...v.ts].sort((a, b) => a - b);
    for (const t of timestamps) {
      const d = dayKey(t);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    videos.push({ id, title: v.title, timestamps, watchmarkerCount: v.count });
  }
  const bulkDays = new Set(
    [...perDay].filter(([, n]) => n >= BULK_DAY_THRESHOLD).map(([d]) => d),
  );
  return { videos, bulkDays };
}
