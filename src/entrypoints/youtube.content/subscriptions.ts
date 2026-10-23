/** Reads the user's subscribed channels from YouTube (see lib/subscriptions.ts). */
import {
  SUBSCRIPTIONS_FORMAT,
  SUBSCRIPTIONS_KEY,
  SUBSCRIPTIONS_MAX_AGE_MS,
  extractSubscriptionsPage,
  type SubscribedChannel,
  type Subscriptions,
} from '@/lib/subscriptions';
import { innertube, readConfig, sleep } from './innertube';

const PAGE_DELAY_MS = 500;
const MAX_PAGES = 50;

async function stored(): Promise<Subscriptions | undefined> {
  return (await browser.storage.local.get(SUBSCRIPTIONS_KEY))[SUBSCRIPTIONS_KEY] as Subscriptions | undefined;
}

export async function subscriptionsDue(): Promise<boolean> {
  const s = await stored();
  // Lists read the old way (e.g. without channel pictures) are read again right away.
  return !s || (s.format ?? 1) < SUBSCRIPTIONS_FORMAT || Date.now() - s.at > SUBSCRIPTIONS_MAX_AGE_MS;
}

let running = false;

export async function syncSubscriptions(): Promise<void> {
  if (running) return;
  running = true;
  const prev = await stored();
  try {
    const cfg = readConfig();
    const channels = new Map<string, SubscribedChannel>();
    let continuation: string | undefined;
    let pages = 0;
    do {
      const response = await innertube(
        cfg,
        'browse',
        continuation ? { continuation } : { browseId: 'FEchannels' },
        '/feed/channels',
      );
      const page = extractSubscriptionsPage(response);
      for (const c of page.channels) channels.set(c.id, c);
      continuation = page.continuation;
      pages++;
      if (continuation) await sleep(PAGE_DELAY_MS);
    } while (continuation && pages < MAX_PAGES);
    const result: Subscriptions = { at: Date.now(), format: SUBSCRIPTIONS_FORMAT, channels: [...channels.values()] };
    await browser.storage.local.set({ [SUBSCRIPTIONS_KEY]: result });
  } catch (e) {
    // Keep the last list; the error is shown in the statistics.
    const failed: Subscriptions = {
      ...prev,
      at: prev?.at ?? 0,
      channels: prev?.channels ?? [],
      error: String(e instanceof Error ? e.message : e),
    };
    await browser.storage.local.set({ [SUBSCRIPTIONS_KEY]: failed });
  } finally {
    running = false;
  }
}
