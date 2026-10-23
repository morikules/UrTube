/**
 * music.youtube.com: records which tracks are played (as music) and, if
 * enabled, marks tracks already heard. Nothing is ever hidden here.
 */
import { setLanguage, t } from '@/lib/i18n';
import { send, type Broadcast } from '@/lib/messages';
import { loadSettings, onSettingsChanged, type Settings } from '@/lib/settings';
import { formatDate, videoIdFromUrl } from '@/lib/youtube';
import { currentAccount } from './youtube.content/account';

/** Seconds of actual playback before a track counts as listened to. */
const LISTEN_MIN_SEC = 10;
/** Rows that stand for one track (lists, search results, cards). */
const ROW_SELECTOR = 'ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer';

const STYLE = `
  [data-ytt-heard] ytmusic-thumbnail-renderer, [data-ytt-heard] .thumbnail { position: relative; }
  [data-ytt-heard] :is(ytmusic-thumbnail-renderer, .image-wrapper) img { opacity: 0.45; }
  [data-ytt-heard] :is(ytmusic-thumbnail-renderer, .image-wrapper)::after {
    content: '✓';
    position: absolute; left: 3px; bottom: 3px; z-index: 5;
    padding: 0 4px; border-radius: 3px;
    background: rgba(0, 0, 0, 0.8); color: #fff;
    font: 600 11px/1.4 Roboto, Arial, sans-serif; pointer-events: none;
  }
`;

interface PlayerData {
  video_id?: string;
  title?: string;
  author?: string;
}

export default defineContentScript({
  matches: ['*://music.youtube.com/*'],
  runAt: 'document_idle',

  async main() {
    let settings: Settings = await loadSettings();
    setLanguage(settings.language);
    let watched = new Map(await send({ type: 'getWatched' }));

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);

    // --- Marking heard tracks -------------------------------------------------

    function markRow(row: Element): void {
      const link = row.querySelector<HTMLAnchorElement>('a[href*="watch?v="]');
      const id = link ? videoIdFromUrl(link.getAttribute('href') ?? '') : null;
      const at = settings.markOnYoutubeMusic && id ? watched.get(id) : undefined;
      const el = row as HTMLElement;
      if (at === undefined) {
        if (el.dataset.yttHeard) delete el.dataset.yttHeard;
        el.removeAttribute('title');
        return;
      }
      const date = formatDate(at);
      if (el.dataset.yttHeard !== date) {
        el.dataset.yttHeard = date;
        el.title = t.content.heardOn(date);
      }
    }

    let pending = false;
    function scan(): void {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        document.querySelectorAll(ROW_SELECTOR).forEach(markRow);
      }, 300);
    }

    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    scan();

    onSettingsChanged((s) => {
      settings = s;
      setLanguage(s.language);
      scan();
    });

    browser.runtime.onMessage.addListener((msg: Broadcast) => {
      if (msg.type === 'watchedChanged') {
        for (const [id, at] of msg.changes) {
          if (at === null) watched.delete(id);
          else watched.set(id, at);
        }
        scan();
      } else if (msg.type === 'watchedReloaded') {
        send({ type: 'getWatched' }).then((list) => {
          watched = new Map(list);
          scan();
        });
      }
    });

    // --- Recording plays --------------------------------------------------------

    /** The play being timed; a repeat of the same track is a new play. */
    let current: string | null = null;
    let played = 0;
    let lastTime: number | null = null;
    let recorded = false;

    function playerData(): PlayerData | null {
      try {
        // Firefox: page objects through wrappedJSObject (same player API as on youtube.com).
        const el = document.querySelector('#movie_player') as (Element & { wrappedJSObject?: any }) | null;
        return el?.wrappedJSObject?.getVideoData?.() ?? null;
      } catch {
        return null;
      }
    }

    // timeupdate does not bubble, so listen in the capture phase.
    document.addEventListener(
      'timeupdate',
      (e) => {
        const video = e.target;
        if (!(video instanceof HTMLVideoElement)) return;
        const data = playerData();
        const id = data?.video_id ? String(data.video_id) : null;
        if (!id) return;
        const now = video.currentTime;
        const restarted = lastTime !== null && now < 3 && lastTime - now > 5;
        if (id !== current || restarted) {
          current = id;
          played = 0;
          recorded = false;
          lastTime = null;
        }
        // Only steady playback counts, not seeking.
        if (lastTime !== null && now > lastTime && now - lastTime < 2) played += now - lastTime;
        lastTime = now;
        if (recorded || played < LISTEN_MIN_SEC) return;
        recorded = true;
        const durationSec = Number.isFinite(video.duration) ? Math.round(video.duration) : undefined;
        currentAccount()
          .then((account) =>
            send({
              type: 'recordMusicPlay',
              videoId: id,
              title: data?.title ? String(data.title) : '',
              channelName: data?.author ? String(data.author) : undefined,
              durationSec,
              account,
            }),
          )
          .catch(() => {});
      },
      true,
    );
  },
});
