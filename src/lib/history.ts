/**
 * Filters for the history list and exports of it (CSV), kept free of UI code
 * so they can be tested.
 */
import type { Video, View } from './db';
import { videoUrl } from './youtube';

/** Below this, an unfinished view is not worth continuing (only opened or a quick look). */
const MIN_RESUME_SEC = 30;

/**
 * Videos to continue: the latest view recorded here is unfinished and got
 * somewhere. Gives the position to continue from (seconds).
 */
export function resumePoints(views: View[], finishedThreshold: number): Map<string, number> {
  const latest = new Map<string, View>();
  for (const v of views) {
    if (v.source !== 'extension' || v.kind !== 'watch') continue;
    const known = latest.get(v.videoId);
    if (!known || v.at > known.at) latest.set(v.videoId, v);
  }
  const points = new Map<string, number>();
  for (const [id, v] of latest) {
    const pos = v.lastPosition ?? v.maxPosition ?? 0;
    if (v.finishedAt || pos < MIN_RESUME_SEC) continue;
    if (v.durationSec && pos / v.durationSec >= finishedThreshold) continue;
    points.set(id, pos);
  }
  return points;
}

export const LENGTH_FILTERS = ['all', 'under1', 'to10', 'to30', 'to60', 'over60'] as const;
export type LengthFilter = (typeof LENGTH_FILTERS)[number];

/** Video length in a range (minutes); videos of unknown length only match "all". */
export function lengthMatches(v: Video, f: LengthFilter): boolean {
  if (f === 'all') return true;
  const d = v.durationSec;
  if (!d) return false;
  const m = d / 60;
  switch (f) {
    case 'under1':
      return m < 1;
    case 'to10':
      return m >= 1 && m < 10;
    case 'to30':
      return m >= 10 && m < 30;
    case 'to60':
      return m >= 30 && m < 60;
    case 'over60':
      return m >= 60;
  }
}

/** Watched within the days (YYYY-MM-DD, local, both included); empty = open. */
export function inDateRange(v: Video, from: string, to: string): boolean {
  if (from && v.lastViewAt < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && v.firstViewAt > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

/** One CSV field: quoted when needed (separator, quote, line break). */
function field(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV with ";" as separator and a BOM, so spreadsheet programs with German
 * settings (Excel) open it correctly. Dates as "2026-10-23 14:05" (local).
 */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(field).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function csvDate(ms: number | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const VIDEO_COLUMNS = [
  'video_id',
  'title',
  'channel',
  'channel_id',
  'url',
  'status',
  'views',
  'first_watched',
  'last_watched',
  'duration_sec',
  'published',
  'category',
  'short',
  'music',
] as const;

export function videosCsv(videos: Video[]): string {
  return toCsv(
    [...VIDEO_COLUMNS],
    videos.map((v) => [
      v.id,
      v.title,
      v.channelName,
      v.channelId,
      videoUrl(v.id, v.isShort),
      v.status,
      v.viewCount,
      csvDate(v.firstViewAt),
      csvDate(v.lastViewAt),
      v.durationSec,
      v.publishedAt?.slice(0, 10),
      v.category,
      v.isShort ? 1 : 0,
      v.isMusic ? 1 : 0,
    ]),
  );
}

export const VIEW_COLUMNS = [
  'video_id',
  'title',
  'channel',
  'watched_at',
  'date_exact',
  'source',
  'kind',
  'entry',
  'watched_sec',
  'max_position_sec',
  'duration_sec',
  'finished',
] as const;

export function viewsCsv(views: View[], videos: Video[]): string {
  const byId = new Map(videos.map((v) => [v.id, v]));
  return toCsv(
    [...VIEW_COLUMNS],
    [...views]
      .sort((a, b) => a.at - b.at)
      .map((w) => {
        const v = byId.get(w.videoId);
        return [
          w.videoId,
          v?.title,
          v?.channelName,
          csvDate(w.at),
          w.dateUncertain ? 0 : w.dayOnly ? 'day' : 1,
          w.source,
          w.kind,
          w.entry,
          w.watchedSeconds,
          w.maxPosition,
          w.durationSec ?? v?.durationSec,
          w.finishedAt ? 1 : 0,
        ];
      }),
  );
}

/** Lets the browser save `text` as a file. */
export function download(text: string, filename: string, type = 'text/csv'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
