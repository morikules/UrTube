/**
 * "Watched: Videos 34 / 120 · Shorts 5 / 80 · Live 2 / 15 · Members only 1 / 4 · Playlists 1 / 12"
 * on a channel page. Counts come from the channel's hidden upload playlists
 * and its "Playlists" tab, read and cached like any playlist (old numbers stay
 * visible while they are read again). Shown below the line with the number of
 * videos in the channel header, found by its text so layout changes do not
 * break it; otherwise next to the switch in the YouTube header.
 */
import { n, t } from '@/lib/i18n';
import {
  CHANNEL_KINDS,
  PLAYLIST_FORMAT,
  channelListId,
  channelPlaylistsId,
  playlistProgress,
  type ChannelKind,
  type PlaylistInfo,
} from '@/lib/playlists';

type Playlists = {
  get(id: string): PlaylistInfo | undefined;
  want(id: string, refresh?: boolean): void;
  refresh(ids: string[]): void;
};

const BOX_CLASS = 'ytt-chan-stats';
/** Parts of the channel header that hold its metadata lines (several layouts). */
const HEADER_SELECTOR =
  'yt-page-header-view-model, yt-page-header-renderer, ytd-c4-tabbed-header-renderer, #page-header, [class*="PageHeader"]';
/** A short text with a number and "Videos"/"videos": the video count line. */
const VIDEO_COUNT_RE = /\d.*\bvideos?\b/i;

/** The channel shown on the page: from YouTube's page data, else the canonical link. */
function channelIdOnPage(): string | null {
  try {
    const browse = document.querySelector('ytd-browse[page-subtype="channels"]') as any;
    const id = browse?.wrappedJSObject?.data?.metadata?.channelMetadataRenderer?.externalId;
    if (typeof id === 'string' && /^UC[\w-]{22}$/.test(id)) return id;
  } catch {
    // page data not reachable: fall back below
  }
  const href = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? '';
  return href.match(/\/channel\/(UC[\w-]{22})/)?.[1] ?? null;
}

/** The line in the channel header that shows the number of videos. */
function videoCountLine(): Element | null {
  for (const header of document.querySelectorAll(`ytd-browse[page-subtype="channels"] :is(${HEADER_SELECTOR})`)) {
    for (const el of header.querySelectorAll('span')) {
      const text = el.textContent?.trim() ?? '';
      if (el.children.length || text.length > 40 || !VIDEO_COUNT_RE.test(text)) continue;
      return el.closest('[class*="MetadataRow"], [class*="metadata-row"], #videos-count') ?? el.parentElement;
    }
  }
  return null;
}

export function createChannelStats(
  playlists: Playlists,
  isWatched: (id: string) => boolean,
  /** Leave members-only videos out of the line (setting). */
  hideMembers: () => boolean,
) {
  let shownFor: string | null = null;

  function listIds(channelId: string): string[] {
    return [...(Object.keys(CHANNEL_KINDS) as ChannelKind[]).map((k) => channelListId(channelId, k)), channelPlaylistsId(channelId)];
  }

  function text(channelId: string): string {
    const T = t.content.channelStats;
    const parts: string[] = [];
    let reading = false;
    for (const kind of Object.keys(CHANNEL_KINDS) as ChannelKind[]) {
      if (kind === 'members' && hideMembers()) continue;
      const p = playlists.get(channelListId(channelId, kind));
      if (!p || p.format !== PLAYLIST_FORMAT) {
        reading = true;
        continue;
      }
      const pr = playlistProgress(p, isWatched);
      if (pr.total) parts.push(`${T[kind]} ${n(pr.seen)} / ${n(pr.total)}${pr.partial ? '+' : ''}`);
    }
    // Playlists count as watched when all their videos are; each one is read in turn.
    const own = playlists.get(channelPlaylistsId(channelId));
    if (!own) reading = true;
    else if (own.videoIds.length) {
      let done = 0;
      let known = 0;
      for (const id of own.videoIds) {
        playlists.want(id);
        const p = playlists.get(id);
        if (!p) continue;
        known++;
        if (playlistProgress(p, isWatched).done) done++;
      }
      if (known < own.videoIds.length) reading = true;
      parts.push(`${T.playlists} ${n(done)} / ${n(own.videoIds.length)}${own.partial ? '+' : ''}`);
    }
    if (!parts.length) return reading ? T.reading : T.none;
    return `${T.watched} ${parts.join(' · ')}${reading ? ' …' : ''}`;
  }

  function render(host: Element, channelId: string, inline: boolean): void {
    let box = document.querySelector<HTMLElement>(`.${BOX_CLASS}`);
    const wrongPlace = box && (inline ? box.previousElementSibling !== host : box.parentElement !== host);
    if (!box || wrongPlace) {
      box?.remove();
      box = document.createElement('div');
      box.className = `${BOX_CLASS}${inline ? '' : ' ytt-chan-stats-chip'}`;
      const label = document.createElement('span');
      label.className = 'ytt-chan-stats-text';
      const sync = document.createElement('button');
      sync.type = 'button';
      sync.className = 'ytt-chan-stats-sync';
      sync.title = t.content.channelStats.refresh;
      sync.textContent = '↻';
      sync.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = box!.dataset.channel!;
        const own = playlists.get(channelPlaylistsId(id));
        playlists.refresh([...listIds(id), ...(own?.videoIds ?? [])]);
      });
      box.append(label, sync);
      if (inline) host.after(box);
      else host.append(box);
    }
    box.dataset.channel = channelId;
    const label = box.querySelector('.ytt-chan-stats-text')!;
    const value = text(channelId);
    if (label.textContent !== value) label.textContent = value;
  }

  /** Called on every scan; cheap when nothing changed. */
  function update(enabled: boolean, onChannelPage: boolean): void {
    const channelId = enabled && onChannelPage ? channelIdOnPage() : null;
    if (!channelId) {
      document.querySelector(`.${BOX_CLASS}`)?.remove();
      shownFor = null;
      return;
    }
    if (shownFor !== channelId) {
      shownFor = channelId;
      for (const id of listIds(channelId)) playlists.want(id);
    }
    const line = videoCountLine();
    const fallback = document.querySelector('.ytt-toggle');
    if (line) render(line, channelId, true);
    else if (fallback) render(fallback, channelId, false);
  }

  /** Whether the video is members-only on the channel shown (from its members list). */
  function isMembersOnly(videoId: string): boolean {
    if (!shownFor) return false;
    return playlists.get(channelListId(shownFor, 'members'))?.videoIds.includes(videoId) ?? false;
  }

  return { update, isMembersOnly };
}
