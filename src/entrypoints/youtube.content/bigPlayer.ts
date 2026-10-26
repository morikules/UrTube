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
/** Normal theater mode turns big again after this long without any activity. */
const IDLE_MS = 3000;
/** Controls appearing within this time after an activity count as caused by it. */
const ACTIVITY_MS = 1000;

export function createBigPlayer(getSettings: () => Settings) {
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let theaterTimer: ReturnType<typeof setTimeout> | undefined;

  const isWatchPage = () => location.pathname === '/watch';
  const root = document.documentElement.classList;

  /**
   * Reveal mode "theater": when the player's controls appear because the user
   * does something, the page becomes normal theater mode (header, title and
   * channel visible). It turns big again when the controls hide while the mouse
   * rests on the video, or after IDLE_MS without any mouse, key or scroll
   * activity anywhere – but not while scrolled down (the page would jump).
   */
  let revealed = false;
  let overPlayer = false;
  let lastActivity = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let watchedPlayer: Element | null = null;
  const playerObserver = new MutationObserver(() => onPlayerChange());

  function revealEnabled(): boolean {
    const s = getSettings();
    const flexy = document.querySelector('ytd-watch-flexy');
    const theater = !!flexy?.hasAttribute('theater') && !flexy.hasAttribute('fullscreen');
    return s.bigPlayer && s.bigPlayerHideHeader && s.bigPlayerReveal === 'theater' && isWatchPage() && theater;
  }

  function controlsShown(): boolean {
    const player = document.querySelector('#movie_player');
    if (player !== watchedPlayer) {
      playerObserver.disconnect();
      if (player) playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
      watchedPlayer = player;
    }
    return !!player && !player.classList.contains('ytp-autohide');
  }

  function setRevealed(on: boolean): void {
    if (on) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(rest, IDLE_MS);
    }
    if (revealed === on) return;
    revealed = on;
    applyClasses();
  }

  /** Nothing happened for a while: big again (unless scrolled down). */
  function rest(): void {
    if (!revealed) return;
    if (window.scrollY === 0) setRevealed(false);
    else idleTimer = setTimeout(rest, IDLE_MS);
  }

  function onActivity(): void {
    lastActivity = Date.now();
    if (!revealEnabled()) return;
    if (revealed || controlsShown()) setRevealed(true);
  }

  function onPlayerChange(): void {
    if (!revealEnabled()) {
      if (revealed) setRevealed(false);
      return;
    }
    // Controls appearing shortly after a mouse move or key press: the user is here.
    if (controlsShown()) {
      if (Date.now() - lastActivity < ACTIVITY_MS) setRevealed(true);
    } else if (overPlayer && window.scrollY === 0) {
      setRevealed(false);
    }
  }

  function applyClasses(): void {
    const s = getSettings();
    const active = s.bigPlayer && isWatchPage() && !revealed;
    root.toggle('ytt-big', active);
    root.toggle('ytt-big-header', active && s.bigPlayerHideHeader);
    root.toggle('ytt-big-sync', active && s.bigPlayerHideHeader && s.bigPlayerReveal === 'overlay');
    root.toggle('ytt-big-solid', active && s.bigPlayerHideHeader && s.bigPlayerHeaderSolid);
  }

  document.addEventListener(
    'pointermove',
    (e) => {
      overPlayer = e.target instanceof Element && e.target.closest('#movie_player') !== null;
      onActivity();
    },
    { capture: true, passive: true },
  );
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) {
    document.addEventListener(type, onActivity, { capture: true, passive: true });
  }
  window.addEventListener('scroll', onActivity, { passive: true });

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
    if (revealed && !revealEnabled()) revealed = false;
    controlsShown(); // watches the player's controls from now on
    applyClasses();
    if (!s.bigPlayer || !isWatchPage()) {
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
