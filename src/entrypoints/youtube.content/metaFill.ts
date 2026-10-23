/**
 * Fills in channel, length and date of videos known without them (progress
 * bar, history sync, imports) by asking YouTube's "player" endpoint, as the
 * page does when a video opens. It does not count as watching and does not
 * appear in the YouTube history. Runs in one YouTube tab at a time: gently for
 * recent videos, faster for all older ones, slowing down when YouTube refuses.
 * What it does is written to storage (MetaFillStatus) for the options page.
 */
import { META_FILL_STATUS_KEY, send, type MetaFillStatus } from '@/lib/messages';
import { YtHttpError, innertube, readConfig, sleep } from './innertube';
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
/** The status (and the lock) are written at most this often while running. */
const STATUS_EVERY_MS = 3000;

async function takeLock(): Promise<boolean> {
  const stored = await browser.storage.local.get(LOCK_KEY);
  const at = (stored[LOCK_KEY] as number | undefined) ?? 0;
  if (Date.now() - at < LOCK_STALE_MS) return false;
  await browser.storage.local.set({ [LOCK_KEY]: Date.now() });
  return true;
}

async function allDoneRecently(): Promise<boolean> {
  const at = ((await browser.storage.local.get(ALL_DONE_KEY))[ALL_DONE_KEY] as number | undefined) ?? 0;
  return Date.now() - at < ALL_RECHECK_MS;
}

/** New gaps are likely (import, restored backup, switched on): check all videos again now. */
export async function recheckAll(): Promise<void> {
  await browser.storage.local.remove(ALL_DONE_KEY);
}

/**
 * Bad requests for one video (e.g. a broken ID from an old import) are not
 * YouTube refusing: such a video is skipped instead of stopping the run.
 */
const isRefusal = (e: unknown) => !(e instanceof YtHttpError) || e.status === 429 || e.status >= 500;

let running = false;

/**
 * One run: recent videos only, or – with `all` – round after round through all
 * older videos until none are left or `keepGoing` says stop.
 */
export async function fillMissingMeta(allWanted: boolean, keepGoing: () => boolean): Promise<void> {
  if (running || !(await takeLock())) return;
  running = true;
  const all = allWanted && !(await allDoneRecently());
  const status: MetaFillStatus = {
    at: Date.now(),
    state: 'running',
    mode: all ? 'all' : 'recent',
    startedAt: Date.now(),
    filled: 0,
    notFound: 0,
    errors: 0,
  };
  let written = 0;
  /** Saves the status (and keeps the lock); while running at most every few seconds. */
  const save = async (force = false) => {
    if (!force && Date.now() - written < STATUS_EVERY_MS) return;
    written = status.at = Date.now();
    await browser.storage.local.set({ [META_FILL_STATUS_KEY]: { ...status }, [LOCK_KEY]: Date.now() });
  };
  /** Waits, keeping the status (and lock) up to date; stops early if `keepGoing` turns false. */
  const wait = async (ms: number) => {
    status.state = 'waiting';
    status.waitUntil = Date.now() + ms;
    await save(true);
    for (let left = ms; left > 0 && keepGoing(); left -= 15_000) {
      await sleep(Math.min(left, 15_000));
      await save(true);
    }
    status.state = 'running';
    delete status.waitUntil;
  };

  let backoff = BACKOFF_START_MS;
  try {
    await save(true);
    const cfg = readConfig();
    while (keepGoing()) {
      const { ids } = await send({ type: 'missingMeta', recentOnly: !all, limit: all ? ALL_BATCH : RECENT_BATCH });
      if (!ids.length) {
        if (all) await browser.storage.local.set({ [ALL_DONE_KEY]: Date.now() });
        status.state = allWanted ? 'done' : 'finished';
        break;
      }
      const notFound: string[] = [];
      for (const id of ids) {
        if (!keepGoing() || status.errors >= MAX_ERRORS_IN_A_ROW) break;
        status.current = id;
        try {
          const resp = await innertube(cfg, 'player', { videoId: id, contentCheckOk: true, racyCheckOk: true }, `/watch?v=${id}`);
          const meta = metaFromPlayerResponse(resp, id);
          if (meta) {
            await send({ type: 'updateVideoMeta', videoId: id, meta, quiet: true });
            status.filled++;
          } else notFound.push(id);
          status.errors = 0;
          backoff = BACKOFF_START_MS;
        } catch (e) {
          status.error = String(e instanceof Error ? e.message : e);
          if (!isRefusal(e)) {
            notFound.push(id); // this one video is broken: skip it for good
          } else {
            // YouTube refuses ("too many requests"): wait longer each time, then go on.
            status.errors++;
            if (status.errors < MAX_ERRORS_IN_A_ROW) await wait(backoff);
            backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
            continue;
          }
        }
        await save();
        await sleep(all ? ALL_DELAY_MS : RECENT_DELAY_MS);
      }
      if (notFound.length) await send({ type: 'metaNotFound', ids: notFound });
      status.notFound += notFound.length;
      if (status.errors >= MAX_ERRORS_IN_A_ROW || !keepGoing()) {
        status.state = 'stopped';
        break;
      }
      if (!all) {
        status.state = 'finished';
        break;
      }
    }
    if (status.state === 'running') status.state = 'stopped'; // switched off meanwhile
  } catch (e) {
    status.state = 'stopped';
    status.error = String(e instanceof Error ? e.message : e);
  } finally {
    running = false;
    delete status.current;
    await save(true);
    await browser.storage.local.set({ [LOCK_KEY]: 0 });
  }
}
