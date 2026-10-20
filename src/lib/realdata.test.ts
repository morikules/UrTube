/**
 * Optional check against your own Watchmarker exports (never committed).
 * Run: YTT_DATA_DIR=/path/to/exports npm test
 * Files whose name contains YTT_DATA_EXCLUDE (if set) are skipped.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TrackerDB, importWatchmarker } from './db';
import { mergeExports, parseExport } from './watchmarker';

const dir = process.env.YTT_DATA_DIR;
const exclude = process.env.YTT_DATA_EXCLUDE;

describe.skipIf(!dir)('real Watchmarker exports', () => {
  it('imports all exports without losing any video', async () => {
    const names = readdirSync(dir!)
      .filter((f) => f.endsWith('.database') && !(exclude && f.includes(exclude)))
      .sort();
    const exports = names.map((f) => parseExport(readFileSync(join(dir!, f), 'utf8')));
    const allIds = new Set(exports.flat().map((e) => e.strIdent));

    const db = new TrackerDB('realdata');
    const start = performance.now();
    const summary = await importWatchmarker(db, mergeExports(exports));
    const ms = Math.round(performance.now() - start);

    console.log({ files: names.length, ...summary, importMs: ms });
    expect(await db.videos.count()).toBe(allIds.size);
    const latest = exports.at(-1)!;
    const stored = await db.videos.bulkGet(latest.map((e) => e.strIdent));
    const older = latest.filter((e, i) => !(stored[i]!.lastViewAt >= e.intTimestamp));
    expect(older).toEqual([]);
  }, 120_000);
});
