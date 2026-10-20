/**
 * Reads the YouTube watch history from inside a YouTube tab (see innertube.ts)
 * and removes deleted videos from it.
 */
import type { ExternalView, PendingRemoval } from '@/lib/db';
import { send } from '@/lib/messages';
import {
  REMOVAL_RESULT_KEY,
  SYNC_CANCEL_KEY,
  SYNC_STATUS_KEY,
  dayToTimestamp,
  extractHistoryPage,
  type RemovalResult,
  type SyncStatus,
} from '@/lib/youtubeHistory';
import { innertube, readConfig, sleep, type YtConfig } from './innertube';

/** History pages searched for videos to remove (like Watchmarker). */
const REMOVAL_SEARCH_PAGES = 16;
/** Give up on a removal after this many failed attempts. */
const MAX_REMOVAL_ATTEMPTS = 3;

/** Pages read by the hourly incremental sync (newest first). */
const INCREMENTAL_PAGES = 2;
/** Pause between pages to stay gentle with YouTube. */
const PAGE_DELAY_MS = 700;
/** A running sync without progress for this long is considered dead. */
const STALE_RUN_MS = 5 * 60 * 1000;

/** True if the user pressed "Abbrechen" after this run started. */
async function cancelRequested(startedAt: number): Promise<boolean> {
  const stored = await browser.storage.local.get(SYNC_CANCEL_KEY);
  return ((stored[SYNC_CANCEL_KEY] as number | undefined) ?? 0) > startedAt;
}

/** Searches the newest history pages for the removal tokens of `ids`. */
async function findTokens(cfg: YtConfig, ids: Set<string>): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  let continuation: string | undefined;
  for (let i = 0; i < REMOVAL_SEARCH_PAGES && tokens.size < ids.size; i++) {
    const response = await innertube(
      cfg,
      'browse',
      continuation ? { continuation } : { browseId: 'FEhistory' },
    );
    const page = extractHistoryPage(response, Date.now());
    for (const item of page.items) {
      if (ids.has(item.videoId) && item.removalToken && !tokens.has(item.videoId)) {
        tokens.set(item.videoId, item.removalToken);
      }
    }
    continuation = page.continuation;
    if (!continuation) break;
    await sleep(PAGE_DELAY_MS);
  }
  return tokens;
}

/**
 * Removes deleted videos from the YouTube watch history (queued by the
 * background). Videos without a remembered token are looked up in the newest
 * history pages. Videos not found there are dropped; failures are retried.
 */
export async function processRemovals(): Promise<void> {
  const pending = await send({ type: 'takeRemovals' });
  if (!pending.length) return;
  const result: RemovalResult = { at: Date.now(), removed: 0, notFound: 0, failed: 0 };
  const retry: PendingRemoval[] = [];
  try {
    const cfg = readConfig();
    const lookup = new Set(pending.filter((p) => !p.token).map((p) => p.videoId));
    const found = lookup.size ? await findTokens(cfg, lookup) : new Map<string, string>();

    for (const item of pending) {
      const token = item.token ?? found.get(item.videoId);
      if (!token) {
        result.notFound++;
        continue;
      }
      try {
        const res = (await innertube(cfg, 'feedback', {
          feedbackTokens: [token],
          isFeedbackTokenUnencrypted: false,
          shouldMerge: false,
        })) as { feedbackResponses?: { isProcessed?: boolean }[] };
        if (res.feedbackResponses?.[0]?.isProcessed === false) throw new Error('nicht verarbeitet');
        result.removed++;
      } catch {
        result.failed++;
        // A remembered token may be outdated: look it up again next time.
        const attempts = (item.attempts ?? 0) + 1;
        if (attempts < MAX_REMOVAL_ATTEMPTS) retry.push({ ...item, token: undefined, attempts });
      }
      await sleep(300);
    }
  } catch (e) {
    // YouTube not ready or not reachable: try everything again later.
    result.error = String(e instanceof Error ? e.message : e);
    retry.push(...pending);
  }
  if (retry.length) await send({ type: 'requeueRemovals', items: retry });
  await browser.storage.local.set({ [REMOVAL_RESULT_KEY]: result });
}

async function readStatus(): Promise<SyncStatus | undefined> {
  const stored = await browser.storage.local.get(SYNC_STATUS_KEY);
  return stored[SYNC_STATUS_KEY] as SyncStatus | undefined;
}

async function saveStatus(status: SyncStatus): Promise<void> {
  await browser.storage.local.set({ [SYNC_STATUS_KEY]: status });
}

/** Whether the hourly sync is due (and no other tab is running one). */
export async function incrementalSyncDue(intervalMs: number): Promise<boolean> {
  const s = await readStatus();
  if (!s) return true;
  if (s.running && Date.now() - s.heartbeat < STALE_RUN_MS) return false;
  return Date.now() - (s.finishedAt ?? s.startedAt) >= intervalMs;
}

/**
 * Reads the history page by page and hands each page to the background.
 * `full` reads everything; otherwise only the newest pages are read.
 */
export async function runHistorySync(full: boolean): Promise<void> {
  const prev = await readStatus();
  if (prev?.running && Date.now() - prev.heartbeat < STALE_RUN_MS) return; // another tab is on it

  const status: SyncStatus = {
    running: true,
    full,
    startedAt: Date.now(),
    heartbeat: Date.now(),
    pages: 0,
    items: 0,
    added: 0,
  };
  await saveStatus(status);

  try {
    const cfg = readConfig();
    let token: string | undefined;
    do {
      if (await cancelRequested(status.startedAt)) {
        status.cancelled = true;
        break;
      }
      const response = await innertube(cfg, 'browse', token ? { continuation: token } : { browseId: 'FEhistory' });
      const now = Date.now();
      const page = extractHistoryPage(response, now);
      if (status.pages === 0 && !page.items.length && !page.continuation) {
        throw new Error('Kein Verlauf gefunden – bei YouTube angemeldet und Verlauf nicht pausiert?');
      }
      const views: ExternalView[] = page.items.map((i) => ({
        videoId: i.videoId,
        title: i.title,
        isShort: i.isShort,
        at: i.day ? dayToTimestamp(i.day, now) : now,
        dayOnly: i.day !== null,
        dateUncertain: i.day === null,
      }));
      const tokens = page.items.flatMap((i) => (i.removalToken ? [{ videoId: i.videoId, token: i.removalToken }] : []));
      const { added } = await send({ type: 'addYoutubeHistory', views, tokens });
      status.tokens = (status.tokens ?? 0) + tokens.length;
      if (!status.missingTokenSample && page.missingTokenSample) {
        status.missingTokenSample = page.missingTokenSample;
      }
      if (page.unknownHeaders.length) {
        status.unknownHeaders = [...new Set([...(status.unknownHeaders ?? []), ...page.unknownHeaders])].slice(0, 10);
      }
      status.pages++;
      status.items += views.length;
      status.added += added;
      status.heartbeat = Date.now();
      await saveStatus(status);

      token = page.continuation;
      if (!full && status.pages >= INCREMENTAL_PAGES) break;
      if (token) await sleep(PAGE_DELAY_MS);
    } while (token);

    status.running = false;
    status.finishedAt = Date.now();
    await saveStatus(status);
  } catch (e) {
    status.running = false;
    status.error = String(e instanceof Error ? e.message : e);
    status.finishedAt = Date.now();
    await saveStatus(status);
  }
}
