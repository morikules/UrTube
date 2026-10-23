/**
 * Fills in channel, length and date of videos known without them (progress
 * bar, history sync, imports) by asking YouTube's "player" endpoint, as the
 * page does when a video opens. It does not count as watching and does not
 * appear in the YouTube history. Runs gently in one YouTube tab at a time.
 */
import { META_FILL_STATUS_KEY, send, type MetaFillStatus } from '@/lib/messages';
import { innertube, readConfig, sleep } from './innertube';
import { metaFromPlayerResponse } from './player';

/** Videos per run of the regular check (every few minutes). */
const RECENT_BATCH = 10;
/** Videos per round while filling in all older videos. */
const ALL_BATCH = 25;
/** Pause between two requests. */
const REQUEST_DELAY_MS = 1500;
/** Only one tab fills in; a lock older than this is considered dead. */
const LOCK_KEY = 'metaFillLock';
const LOCK_STALE_MS = 2 * 60 * 1000;

async function takeLock(): Promise<boolean> {
  const stored = await browser.storage.local.get(LOCK_KEY);
  const at = (stored[LOCK_KEY] as number | undefined) ?? 0;
  if (Date.now() - at < LOCK_STALE_MS) return false;
  await browser.storage.local.set({ [LOCK_KEY]: Date.now() });
  return true;
}

let running = false;

/**
 * One run: recent videos only, or – with `all` – round after round through all
 * older videos until none are left, `keepGoing` says stop or YouTube refuses.
 */
export async function fillMissingMeta(all: boolean, keepGoing: () => boolean): Promise<void> {
  if (running || !(await takeLock())) return;
  running = true;
  const status: MetaFillStatus = { at: Date.now(), filled: 0, notFound: 0 };
  try {
    const cfg = readConfig();
    do {
      const { ids } = await send({ type: 'missingMeta', recentOnly: !all, limit: all ? ALL_BATCH : RECENT_BATCH });
      if (!ids.length) break;
      const notFound: string[] = [];
      for (const id of ids) {
        if (!keepGoing()) break;
        // Network errors and refusals (e.g. too many requests) end the run; next run retries.
        const resp = await innertube(cfg, 'player', { videoId: id, contentCheckOk: true, racyCheckOk: true }, `/watch?v=${id}`);
        const meta = metaFromPlayerResponse(resp, id);
        if (meta) {
          await send({ type: 'updateVideoMeta', videoId: id, meta, quiet: true });
          status.filled++;
        } else notFound.push(id);
        await browser.storage.local.set({ [LOCK_KEY]: Date.now() });
        await sleep(REQUEST_DELAY_MS);
      }
      if (notFound.length) await send({ type: 'metaNotFound', ids: notFound });
      status.notFound += notFound.length;
    } while (all && keepGoing());
  } catch (e) {
    status.error = String(e instanceof Error ? e.message : e);
  } finally {
    running = false;
    status.at = Date.now();
    // Runs that had nothing to do keep the last real result visible.
    const worked = status.filled || status.notFound || status.error;
    await browser.storage.local.set({ [LOCK_KEY]: 0, ...(worked ? { [META_FILL_STATUS_KEY]: status } : {}) });
  }
}
