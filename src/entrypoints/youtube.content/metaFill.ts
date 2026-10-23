/**
 * Fills in channel, length and date of videos known without them (progress
 * bar, history sync, imports) by asking YouTube's "player" endpoint, as the
 * page does when a video opens. It does not count as watching and does not
 * appear in the YouTube history. Runs in one YouTube tab at a time: gently for
 * recent videos, faster for all older ones, slowing down when YouTube refuses.
 */
import { META_FILL_STATUS_KEY, send, type MetaFillStatus } from '@/lib/messages';
import { innertube, readConfig, sleep } from './innertube';
import { metaFromPlayerResponse } from './player';

/** Videos per run of the regular check (every few minutes). */
const RECENT_BATCH = 10;
/** Videos per round while filling in all older videos. */
const ALL_BATCH = 50;
/** Pause between two requests: recent videos, and all older ones (about 7,000 per hour). */
const RECENT_DELAY_MS = 1500;
const ALL_DELAY_MS = 300;
/** When YouTube refuses: wait 30 s, doubling up to 10 min; give up the run after this many errors in a row. */
const BACKOFF_START_MS = 30_000;
const BACKOFF_MAX_MS = 10 * 60_000;
const MAX_ERRORS_IN_A_ROW = 5;
/** Once all older videos have details, they are only checked again after a day. */
const ALL_DONE_KEY = 'metaFillAllDoneAt';
const ALL_RECHECK_MS = 24 * 3_600_000;
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

const renewLock = () => browser.storage.local.set({ [LOCK_KEY]: Date.now() });

/** Waits, keeping the lock alive meanwhile; stops early if `keepGoing` turns false. */
async function wait(ms: number, keepGoing: () => boolean): Promise<void> {
  for (let left = ms; left > 0 && keepGoing(); left -= 30_000) {
    await sleep(Math.min(left, 30_000));
    await renewLock();
  }
}

async function allDoneRecently(): Promise<boolean> {
  const at = ((await browser.storage.local.get(ALL_DONE_KEY))[ALL_DONE_KEY] as number | undefined) ?? 0;
  return Date.now() - at < ALL_RECHECK_MS;
}

/** New gaps are likely (import, restored backup, switched on): check all videos again now. */
export async function recheckAll(): Promise<void> {
  await browser.storage.local.remove(ALL_DONE_KEY);
}

let running = false;

/**
 * One run: recent videos only, or – with `all` – round after round through all
 * older videos until none are left or `keepGoing` says stop.
 */
export async function fillMissingMeta(allWanted: boolean, keepGoing: () => boolean): Promise<void> {
  if (running || !(await takeLock())) return;
  running = true;
  const all = allWanted && !(await allDoneRecently());
  const status: MetaFillStatus = { at: Date.now(), filled: 0, notFound: 0 };
  let errors = 0;
  let backoff = BACKOFF_START_MS;
  let lockAt = Date.now();
  try {
    const cfg = readConfig();
    while (keepGoing()) {
      const { ids } = await send({ type: 'missingMeta', recentOnly: !all, limit: all ? ALL_BATCH : RECENT_BATCH });
      if (!ids.length) {
        if (all) await browser.storage.local.set({ [ALL_DONE_KEY]: Date.now() });
        break;
      }
      const notFound: string[] = [];
      for (const id of ids) {
        if (!keepGoing() || errors >= MAX_ERRORS_IN_A_ROW) break;
        try {
          const resp = await innertube(cfg, 'player', { videoId: id, contentCheckOk: true, racyCheckOk: true }, `/watch?v=${id}`);
          const meta = metaFromPlayerResponse(resp, id);
          if (meta) {
            await send({ type: 'updateVideoMeta', videoId: id, meta, quiet: true });
            status.filled++;
          } else notFound.push(id);
          errors = 0;
          backoff = BACKOFF_START_MS;
          delete status.error;
        } catch (e) {
          // Probably "too many requests": wait longer each time, then go on with this run.
          errors++;
          status.error = String(e instanceof Error ? e.message : e);
          if (errors < MAX_ERRORS_IN_A_ROW) await wait(backoff, keepGoing);
          backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
          continue;
        }
        if (Date.now() - lockAt > 30_000) {
          lockAt = Date.now();
          await renewLock();
        }
        await sleep(all ? ALL_DELAY_MS : RECENT_DELAY_MS);
      }
      if (notFound.length) await send({ type: 'metaNotFound', ids: notFound });
      status.notFound += notFound.length;
      if (!all || errors >= MAX_ERRORS_IN_A_ROW) break;
    }
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
