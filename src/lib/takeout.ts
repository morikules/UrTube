/**
 * Reading the YouTube watch history from Google Takeout (`watch-history.json`).
 *
 * Format: JSON array of activity entries, newest first, e.g.
 * { header: "YouTube" | "YouTube Music", title: "Watched <title>",
 *   titleUrl: "https://www.youtube.com/watch?v=<id>",
 *   subtitles: [{ name: <channel>, url: ".../channel/UC…" }],
 *   time: "2024-05-01T12:34:56.789Z", details?: [{ name: "From Google Ads" }] }
 * Every watch is its own entry, so rewatches appear several times.
 */
import { t } from './i18n';
import { videoIdFromUrl } from './youtube';

export interface TakeoutEntry {
  videoId: string;
  title: string;
  at: number;
  /** Played in YouTube Music. */
  music: boolean;
  channelId?: string;
  channelName?: string;
}

export interface TakeoutFile {
  entries: TakeoutEntry[];
  /** Watched ads (Takeout lists them like videos). */
  ads: number;
  /** Entries without a video link (removed or private videos, other activity). */
  noVideo: number;
}

const CHANNEL_RE = /\/channel\/(UC[\w-]{22})/;

/** "Watched X" (English) or "X angesehen" (German); other languages keep the full text. */
export function stripWatched(title: string): string {
  return title.replace(/^Watched /, '').replace(/ angesehen$/, '').trim();
}

export function parseTakeout(text: string): TakeoutFile {
  if (text.trimStart().startsWith('<')) {
    throw new Error(t.errors.takeoutHtml);
  }
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(t.errors.notAList);

  const result: TakeoutFile = { entries: [], ads: 0, noVideo: 0 };
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const details = Array.isArray(r.details) ? r.details : [];
    if (details.some((d) => /Google Ads/i.test(String((d as { name?: unknown })?.name ?? '')))) {
      result.ads++;
      continue;
    }
    const url = typeof r.titleUrl === 'string' ? r.titleUrl : '';
    const videoId = url ? videoIdFromUrl(url) : null;
    const at = typeof r.time === 'string' ? Date.parse(r.time) : NaN;
    if (!videoId || Number.isNaN(at)) {
      result.noVideo++;
      continue;
    }
    const channel = Array.isArray(r.subtitles) ? (r.subtitles[0] as { name?: unknown; url?: unknown }) : undefined;
    const channelId = typeof channel?.url === 'string' ? channel.url.match(CHANNEL_RE)?.[1] : undefined;
    result.entries.push({
      videoId,
      title: stripWatched(typeof r.title === 'string' ? r.title : ''),
      at,
      music: r.header === 'YouTube Music' || url.includes('music.youtube.com'),
      channelId,
      channelName: typeof channel?.name === 'string' ? channel.name : undefined,
    });
  }
  return result;
}
