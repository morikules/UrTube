/**
 * Applies the preferred playback settings (quality, speed, subtitles) once
 * when a video starts. Uses YouTube's player API, reached through Firefox's
 * `wrappedJSObject`. Changes the user makes afterwards are not touched.
 */
import { pickQuality, type Settings } from '@/lib/settings';

/** Firefox: copies an object into the page so page functions can use it. */
declare function cloneInto<T>(obj: T, target: object): T;

/** Retry while the player loads or an ad plays (about one minute). */
const RETRY_MS = 1000;
const MAX_ATTEMPTS = 60;

// The player API is not typed; only the functions used here.
interface YtPlayer {
  getVideoData?(): { video_id?: string };
  getAvailableQualityLevels?(): string[];
  setPlaybackQualityRange?(min: string, max: string): void;
  setPlaybackQuality?(q: string): void;
  setPlaybackRate?(rate: number): void;
  isSubtitlesOn?(): boolean;
  toggleSubtitles?(): void;
  loadModule?(name: string): void;
  getOption?(module: string, option: string): unknown;
  setOption?(module: string, option: string, value: unknown): void;
}

function player(): { el: Element; api: YtPlayer } | null {
  const el = document.querySelector('#movie_player');
  const api = (el as unknown as { wrappedJSObject?: YtPlayer } | null)?.wrappedJSObject;
  return el && api ? { el, api } : null;
}

function applyCaptions(api: YtPlayer, s: Settings): boolean {
  if (s.playerCaptions === 'off') {
    if (api.isSubtitlesOn?.()) api.toggleSubtitles?.();
    return true;
  }
  // 'on': pick the preferred language if the video has it, otherwise any track.
  api.loadModule?.('captions');
  const tracks = Array.from((api.getOption?.('captions', 'tracklist') as { languageCode?: string }[]) ?? []);
  if (!tracks.length) return false; // not loaded yet, try again
  const lang = s.playerCaptionLang.trim().toLowerCase();
  const track = tracks.find((t) => t.languageCode?.toLowerCase().startsWith(lang)) ?? tracks[0]!;
  api.setOption?.('captions', 'track', cloneInto({ languageCode: track.languageCode }, window));
  return true;
}

export function applyPlayerPrefs(videoId: string, getSettings: () => Settings): void {
  const s = getSettings();
  if (s.playerQuality === 'auto' && !s.playerSpeed && s.playerCaptions === 'keep') return;

  let qualityDone = s.playerQuality === 'auto';
  let speedDone = !s.playerSpeed;
  let captionsDone = s.playerCaptions === 'keep';
  let attempt = 0;

  const tryApply = () => {
    // Stop once the user has moved on to another page or video.
    if (location.pathname !== '/watch' || new URLSearchParams(location.search).get('v') !== videoId) return;
    const p = player();
    const sameVideo = p?.api.getVideoData?.()?.video_id === videoId;
    // Wait for the player of this video, and until any ad has finished.
    if (p && sameVideo && !p.el.classList.contains('ad-showing')) {
      try {
        if (!qualityDone) {
          const q = pickQuality(s.playerQuality, Array.from(p.api.getAvailableQualityLevels?.() ?? []));
          if (q) {
            p.api.setPlaybackQualityRange?.(q, q);
            p.api.setPlaybackQuality?.(q);
            qualityDone = true;
          }
        }
        if (!speedDone) {
          p.api.setPlaybackRate?.(s.playerSpeed);
          speedDone = true;
        }
        if (!captionsDone) captionsDone = applyCaptions(p.api, s);
      } catch {
        // Player API changed or not ready: retry below.
      }
    }
    if ((!qualityDone || !speedDone || !captionsDone) && ++attempt < MAX_ATTEMPTS) {
      setTimeout(tryApply, RETRY_MS);
    }
  };
  setTimeout(tryApply, 500);
}
