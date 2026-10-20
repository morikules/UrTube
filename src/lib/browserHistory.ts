import type { ExternalView } from './db';
import { videoIdFromUrl } from './youtube';

const VIDEO_URL = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts\/)|youtu\.be\/)/;

/** "Some title - YouTube" → "Some title"; YouTube's generic page title → undefined. */
export function cleanTitle(title: string | undefined): string | undefined {
  const t = title?.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '').trim();
  return t && t !== 'YouTube' ? t : undefined;
}

/**
 * Reads all visits of YouTube video pages from the Firefox history.
 * `since` limits the search to recently visited pages (incremental sync).
 * `shouldStop` is checked between batches; what was read until then is returned.
 */
export async function readBrowserHistory(
  since = 0,
  shouldStop: () => boolean = () => false,
): Promise<{ scanned: number; views: ExternalView[]; cancelled: boolean }> {
  const items = await browser.history.search({
    text: '',
    startTime: since,
    maxResults: 1_000_000,
  });
  const videoItems = items.filter((i) => i.url && VIDEO_URL.test(i.url) && videoIdFromUrl(i.url));

  const views: ExternalView[] = [];
  const CHUNK = 50;
  let scanned = 0;
  for (let i = 0; i < videoItems.length; i += CHUNK) {
    if (shouldStop()) return { scanned, views, cancelled: true };
    scanned = Math.min(i + CHUNK, videoItems.length);
    await Promise.all(
      videoItems.slice(i, i + CHUNK).map(async (item) => {
        const videoId = videoIdFromUrl(item.url!)!;
        const title = cleanTitle(item.title);
        const isShort = item.url!.includes('/shorts/');
        const visits = await browser.history.getVisits({ url: item.url! });
        for (const v of visits) {
          if (v.visitTime && v.visitTime >= since) views.push({ videoId, title, at: v.visitTime, isShort });
        }
      }),
    );
  }
  return { scanned: videoItems.length, views, cancelled: false };
}
