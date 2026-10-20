import type { VideoMeta } from '@/lib/db';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Reads video details from YouTube's player API. Firefox lets content scripts
 * reach page objects through `wrappedJSObject`. Returns null if the player is
 * not ready yet or still shows another video.
 */
export function readPlayerMeta(videoId: string, isShort: boolean): (VideoMeta & { title?: string }) | null {
  try {
    const el = document.querySelector(isShort ? '#shorts-player' : '#movie_player');
    const player = (el as any)?.wrappedJSObject;
    const resp = player?.getPlayerResponse?.();
    const d = resp?.videoDetails;
    if (!d || d.videoId !== videoId) return null;
    const mf = resp.microformat?.playerMicroformatRenderer;
    const profile = str(mf?.ownerProfileUrl);
    return {
      title: str(d.title),
      channelId: str(d.channelId),
      channelName: str(d.author),
      channelHandle: profile?.match(/\/(@[^/?#]+)/)?.[1],
      durationSec: num(d.lengthSeconds),
      publishedAt: str(mf?.publishDate) ?? str(mf?.uploadDate),
      isLive: d.isLiveContent === true,
      category: str(mf?.category),
      isShort,
    };
  } catch {
    return null;
  }
}

/** Fallback when the player API is not available: channel from the page. */
export function readDomMeta(isShort: boolean): VideoMeta {
  const link = document.querySelector<HTMLAnchorElement>(
    isShort
      ? 'ytd-reel-video-renderer[is-active] a[href^="/@"], ytd-shorts a[href^="/@"]'
      : 'ytd-watch-metadata ytd-channel-name a',
  );
  const href = link?.getAttribute('href') ?? '';
  return {
    channelName: link?.textContent?.trim() || undefined,
    channelHandle: href.match(/^\/(@[^/?#]+)/)?.[1],
    isShort,
  };
}
