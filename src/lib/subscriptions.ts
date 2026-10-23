/**
 * The channels the user subscribed to, read from YouTube's channel list
 * ("FEchannels", youtube.com/feed/channels) in a YouTube tab and kept in
 * storage.local. Only used to filter and complete the channel list in the
 * statistics; nothing leaves the browser.
 */
import { findContinuation, isObj, text, walkKeys, type Json } from './ytjson';

export interface SubscribedChannel {
  id: string;
  name: string;
  /** "@handle", if known. */
  handle?: string;
  /** Channel picture (yt3.ggpht.com). */
  avatar?: string;
}

/** Channel pictures seen on channel pages and in the subscriptions: {channelId: url}. */
export const CHANNEL_AVATARS_KEY = 'channelAvatars';

/** The first channel picture URL below `node` (absolute). */
export function avatarIn(node: unknown): string | undefined {
  const url = JSON.stringify(node ?? null).match(/"url":"((?:https:)?\/\/yt\d\.(?:ggpht|googleusercontent)\.com\/[^"]+)"/)?.[1];
  return url ? (url.startsWith('//') ? `https:${url}` : url) : undefined;
}

export interface Subscriptions {
  /** When the list was read completely. */
  at: number;
  channels: SubscribedChannel[];
  error?: string;
}

export const SUBSCRIPTIONS_KEY = 'subscriptions';
/** Read again after this long (while a YouTube tab is open), or with ↻. */
export const SUBSCRIPTIONS_MAX_AGE_MS = 24 * 3_600_000;

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

function handleFrom(v: Json): string | undefined {
  const url = ((v.navigationEndpoint as Json | undefined)?.browseEndpoint as Json | undefined)?.canonicalBaseUrl;
  return typeof url === 'string' ? url.match(/^\/(@[^/?#]+)/)?.[1] : undefined;
}

/** Channels and the continuation token from one page of the channel list (old and new layouts). */
export function extractSubscriptionsPage(response: unknown): { channels: SubscribedChannel[]; continuation?: string } {
  const found = new Map<string, SubscribedChannel>();
  walkKeys(response, (key, v) => {
    if (!isObj(v)) return;
    if ((key === 'channelRenderer' || key === 'gridChannelRenderer') && typeof v.channelId === 'string') {
      const name = text(v.title);
      if (CHANNEL_ID_RE.test(v.channelId) && name) {
        found.set(v.channelId, { id: v.channelId, name, handle: handleFrom(v), avatar: avatarIn(v.thumbnail) });
      }
    }
    if (key === 'lockupViewModel' && typeof v.contentId === 'string' && CHANNEL_ID_RE.test(v.contentId)) {
      const meta = (v.metadata as Json | undefined)?.lockupMetadataViewModel as Json | undefined;
      const name = text(meta?.title);
      if (name && !found.has(v.contentId)) found.set(v.contentId, { id: v.contentId, name, avatar: avatarIn(v.contentImage) });
    }
  });
  return { channels: [...found.values()], continuation: findContinuation(response) };
}
