/**
 * Big player on the video page, modelled on the userscript "Youtube
 * Fullscreen Mode" (ndaesik): theater mode fills the window height, the
 * header slides away, and comments/recommendations stay out of sight until
 * the user scrolls. The look is done in CSS via classes on <html>.
 */
import type { Settings } from '@/lib/settings';

/** Time at the top of the page before the area below the player is hidden. */
const FOCUS_DELAY_MS = 2000;
const THEATER_RETRIES = 4;
const THEATER_RETRY_MS = 500;

export function createBigPlayer(getSettings: () => Settings) {
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let theaterTimer: ReturnType<typeof setTimeout> | undefined;

  const isWatchPage = () => location.pathname === '/watch';
  const root = document.documentElement.classList;

  function scheduleFocus(): void {
    clearTimeout(focusTimer);
    root.remove('ytt-big-focus');
    const s = getSettings();
    if (!s.bigPlayer || !s.bigPlayerFocus || !isWatchPage()) return;
    focusTimer = setTimeout(() => {
      if (window.scrollY === 0 && isWatchPage()) root.add('ytt-big-focus');
    }, FOCUS_DELAY_MS);
  }

  /** Clicks YouTube's own theater button, so YouTube keeps its state consistent. */
  function enterTheater(attempt = 0): void {
    clearTimeout(theaterTimer);
    if (!isWatchPage()) return;
    const flexy = document.querySelector('ytd-watch-flexy');
    if (flexy?.hasAttribute('theater') || flexy?.hasAttribute('fullscreen')) return;
    const button = document.querySelector<HTMLButtonElement>('.ytp-size-button');
    if (button) button.click();
    else if (attempt < THEATER_RETRIES) {
      theaterTimer = setTimeout(() => enterTheater(attempt + 1), THEATER_RETRY_MS);
    }
  }

  /** Applies the settings; call on start, on settings change and on navigation. */
  function update(navigated: boolean): void {
    const s = getSettings();
    const active = s.bigPlayer && isWatchPage();
    root.toggle('ytt-big', active);
    root.toggle('ytt-big-header', active && s.bigPlayerHideHeader);
    if (!active) {
      clearTimeout(focusTimer);
      root.remove('ytt-big-focus');
      return;
    }
    if (navigated) {
      window.scrollTo(0, 0);
      // Only once per video: if the user leaves theater mode, that is respected.
      if (s.bigPlayerAutoTheater) enterTheater();
    }
    scheduleFocus();
  }

  // Any sign of wanting to scroll brings comments and recommendations back.
  const reveal = () => {
    if (root.contains('ytt-big-focus')) root.remove('ytt-big-focus');
  };
  window.addEventListener('wheel', reveal, { passive: true });
  window.addEventListener('touchmove', reveal, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'PageDown', 'End'].includes(e.key)) reveal();
  });
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY === 0) scheduleFocus();
      else {
        clearTimeout(focusTimer);
        reveal();
      }
    },
    { passive: true },
  );

  return { update };
}
