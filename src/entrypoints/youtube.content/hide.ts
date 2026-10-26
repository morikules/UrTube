/**
 * Deciding which video cards to hide (watched videos, content filters).
 * Hiding itself is done by CSS: cards get `data-ytt-hide="<reason>"` and are
 * only invisible while the header switch is on.
 */
import type { Settings } from '@/lib/settings';
import { parseRelativeAge, type PageKind } from '@/lib/youtube';

/** Cards that can be hidden; the outer grid item is preferred (no gaps in the grid). */
export const HIDE_CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-grid-video-renderer',
  'ytd-video-renderer',
  // Sidebar and playlists in the old layout (needed for hidden items and playlists).
  'ytd-compact-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-playlist-renderer',
  'ytd-grid-playlist-renderer',
  'ytd-compact-playlist-renderer',
  'yt-lockup-view-model',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
  'ytd-reel-item-renderer',
].join(', ');

export type HideReason =
  | 'watched'
  | 'shorts'
  | 'live'
  | 'premiere'
  | 'members'
  /** Hidden by the user (⊘), everywhere. */
  | 'dismissed'
  /** Playlist with all videos watched. */
  | 'playlist-done';

const DAY_MS = 86_400_000;

/** Elements YouTube uses for badges on thumbnails and below titles. */
const BADGE_SELECTOR = [
  'badge-shape',
  '.badge',
  'ytd-badge-supported-renderer',
  'yt-thumbnail-badge-view-model',
  'ytd-thumbnail-overlay-time-status-renderer',
  '.yt-badge-shape',
].join(', ');

/** The element to hide for a card: the grid item around it, if any. */
export function hideTarget(card: Element): Element {
  return card.closest('ytd-rich-item-renderer') ?? card;
}

/**
 * Short texts of a card (badges, metadata line, buttons), lower case. Long
 * texts (titles, descriptions) are skipped so words in titles do not count.
 */
function shortTexts(card: Element): string[] {
  const texts = new Set<string>();
  for (const el of card.querySelectorAll(`${BADGE_SELECTOR}, span, button`)) {
    const t = el.textContent?.trim().toLowerCase();
    if (t && t.length < 60) texts.add(t);
    const label = el.getAttribute('aria-label')?.toLowerCase();
    if (label && label.length < 60) texts.add(label);
  }
  return [...texts];
}

function isShort(card: Element): boolean {
  return (
    card.matches('ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer') ||
    card.querySelector('a[href^="/shorts/"]') !== null
  );
}

function isLive(card: Element, texts: string[]): boolean {
  return (
    card.querySelector('[overlay-style="LIVE"], .badge-style-type-live-now-alternate, [class*="thumbnail-live"]') !==
      null ||
    texts.some((t) => t === 'live' || t === 'live jetzt' || t === 'jetzt live' || /\d.*\b(zuschauer|watching)\b/.test(t))
  );
}

/** Premieres and scheduled streams: "Geplant für …", "Premiere am …", reminder button. */
function isUpcoming(card: Element, texts: string[]): boolean {
  return (
    card.querySelector('[overlay-style="UPCOMING"], [class*="upcoming"]') !== null ||
    texts.some((t) =>
      /^(geplant für|geplant am|premiere|bevorstehend|upcoming|scheduled for|premieres|benachrichtigen|notify me|erinnerung)/.test(
        t,
      ),
    )
  );
}

function isMembersOnly(card: Element, texts: string[]): boolean {
  return (
    card.querySelector('.badge-style-type-members-only, [class*="members-only"]') !== null ||
    texts.some((t) => /^(nur für (kanal)?mitglieder|members only|mitglieder)/.test(t))
  );
}

/** Age of the video from the "vor 3 Tagen" text in the card's metadata. */
export function cardAge(card: Element): number | null {
  for (const span of card.querySelectorAll('span')) {
    const text = span.textContent ?? '';
    if (text.length > 60) continue; // titles and descriptions
    const age = parseRelativeAge(text);
    if (age !== null) return age;
  }
  return null;
}

/** Whether the content filters (Shorts, premieres, live streams, members only) work on this page. */
export function filtersApply(page: PageKind, settings: Settings): boolean {
  return (
    page === 'subscriptions' ||
    (page === 'home' && settings.filtersOnHome) ||
    (page === 'watch' && settings.filtersOnSidebar)
  );
}

/** Why a card should be hidden on this page, or null to show it. */
export function hideReason(
  card: Element,
  page: PageKind,
  settings: Settings,
  watchedAt: number | undefined,
  /** Known as members-only from the channel's members list (channel pages). */
  knownMembersOnly = false,
): HideReason | null {
  if (page === 'other') return null;

  if (filtersApply(page, settings)) {
    if (settings.filterShorts && isShort(card)) return 'shorts';
    if (settings.filterLive || settings.filterPremieres || settings.filterMembersOnly) {
      const texts = shortTexts(card);
      if (settings.filterLive && isLive(card, texts)) return 'live';
      if (settings.filterPremieres && isUpcoming(card, texts)) return 'premiere';
      if (settings.filterMembersOnly && isMembersOnly(card, texts)) return 'members';
    }
  } else if (page === 'channel' && settings.filterMembersOnly && settings.filterMembersOnlyOnChannels) {
    if (knownMembersOnly || isMembersOnly(card, shortTexts(card))) return 'members';
  }

  if (watchedAt === undefined) return null;
  let windowDays: number;
  if (page === 'subscriptions') {
    if (!settings.hideOnSubscriptions) return null;
    windowDays = settings.hideWindowSubscriptions;
  } else if (page === 'channel') {
    if (!settings.hideOnChannels) return null;
    windowDays = settings.hideWindowChannels;
  } else if (page === 'playlist') {
    // A playlist is not sorted by age, so no time limit.
    if (!settings.hideOnPlaylists) return null;
    windowDays = 0;
  } else if (page === 'search') {
    if (!settings.hideOnSearch) return null;
    windowDays = 0;
  } else if (page === 'watch') {
    if (!settings.hideOnSidebar) return null;
    windowDays = 0;
  } else {
    if (!settings.hideOnHome) return null;
    windowDays = settings.hideWindowHome;
  }
  if (windowDays === 0) return 'watched';
  // Older videos stay visible, so YouTube stops loading more and more.
  const age = cardAge(card);
  return age === null || age <= windowDays * DAY_MS ? 'watched' : null;
}
