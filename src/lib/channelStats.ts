/**
 * How much of a channel was watched: videos, Shorts, live streams and
 * members-only videos from the channel's hidden upload playlists, and its
 * playlists (a playlist counts once all its videos are watched). Used on the
 * channel page and in the statistics.
 */
import { n, t } from './i18n';
import {
  CHANNEL_KINDS,
  PLAYLIST_FORMAT,
  channelListId,
  channelPlaylistsId,
  playlistProgress,
  type ChannelKind,
  type PlaylistInfo,
} from './playlists';

/** All lists read for a channel. */
export function channelListIds(channelId: string): string[] {
  return [...(Object.keys(CHANNEL_KINDS) as ChannelKind[]).map((k) => channelListId(channelId, k)), channelPlaylistsId(channelId)];
}

export interface ChannelSummary {
  /** "Watched: Videos 34 / 120 · Playlists 1 / 12", or that it is being counted / empty. */
  text: string;
  /** Something is still missing (not read yet). */
  reading: boolean;
  /** Nothing was ever read for this channel. */
  unknown: boolean;
  /** When the videos were last counted. */
  countedAt?: number;
  /** Watched and total uploads (videos, Shorts, live streams; members-only unless hidden). */
  seen: number;
  total: number;
  /** The channel's playlists (to be read for their progress). */
  playlistIds: string[];
}

export function summarizeChannel(
  channelId: string,
  get: (id: string) => PlaylistInfo | undefined,
  isWatched: (id: string) => boolean,
  { hideMembers = false, withPrefix = true } = {},
): ChannelSummary {
  const T = t.content.channelStats;
  const parts: string[] = [];
  let reading = false;
  let unknown = true;
  let countedAt: number | undefined;
  let seen = 0;
  let total = 0;
  for (const kind of Object.keys(CHANNEL_KINDS) as ChannelKind[]) {
    const p = get(channelListId(channelId, kind));
    if (p) unknown = false;
    if (kind === 'videos' && p) countedAt = p.fetchedAt;
    if (kind === 'members' && hideMembers) continue;
    if (!p || p.format !== PLAYLIST_FORMAT) {
      reading = true;
      continue;
    }
    const pr = playlistProgress(p, isWatched);
    seen += pr.seen;
    total += pr.total;
    if (pr.total) parts.push(`${T[kind]} ${n(pr.seen)} / ${n(pr.total)}${pr.partial ? '+' : ''}`);
  }
  const own = get(channelPlaylistsId(channelId));
  if (!own) reading = true;
  else if (own.videoIds.length) {
    let done = 0;
    let known = 0;
    for (const id of own.videoIds) {
      const p = get(id);
      if (!p) continue;
      known++;
      if (playlistProgress(p, isWatched).done) done++;
    }
    if (known < own.videoIds.length) reading = true;
    parts.push(`${T.playlists} ${n(done)} / ${n(own.videoIds.length)}${own.partial ? '+' : ''}`);
  }
  const body = parts.join(' · ');
  const text = !parts.length ? (reading ? T.reading : T.none) : `${withPrefix ? `${T.watched} ` : ''}${body}${reading ? ' …' : ''}`;
  return { text, reading, unknown, countedAt, seen, total, playlistIds: own?.videoIds ?? [] };
}
