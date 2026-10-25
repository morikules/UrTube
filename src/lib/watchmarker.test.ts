import { describe, expect, it } from 'vitest';
import { BULK_DAY_THRESHOLD, mergeExports, parseExport, type WatchmarkerEntry } from './watchmarker';

/** Builds an export file the way Watchmarker writes it (base64 of UTF-8 JSON). */
export function encodeExport(entries: WatchmarkerEntry[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  return btoa(String.fromCharCode(...bytes));
}

const t = (iso: string) => Date.parse(iso);
const entry = (id: string, iso: string, title = `Video ${id}`, count = 1): WatchmarkerEntry => ({
  strIdent: id,
  intTimestamp: t(iso),
  strTitle: title,
  intCount: count,
});

describe('parseExport', () => {
  it('decodes base64 JSON including umlauts and emoji', () => {
    const entries = [entry('aaaaaaaaaaa', '2025-01-01T10:00:00Z', 'Größe 🦉 Test')];
    expect(parseExport(encodeExport(entries))).toEqual(entries);
  });

  it('rejects data that is not a list of entries', () => {
    expect(() => parseExport(btoa('{"a":1}'))).toThrow();
    expect(() => parseExport(btoa('[{"foo":1}]'))).toThrow(/position 0/);
  });

  it('skips entries without a video ID or a real time', () => {
    const good = entry('aaaaaaaaaaa', '2025-01-01T10:00:00Z');
    const text = encodeExport([good, entry('<script>', '2025-01-01T10:00:00Z'), { ...good, intTimestamp: -1 }]);
    expect(parseExport(text)).toEqual([good]);
  });
});

describe('mergeExports', () => {
  it('keeps every distinct timestamp and recovers entries missing in later exports', () => {
    const older = [
      entry('aaaaaaaaaaa', '2024-10-01T10:00:00Z'),
      entry('bbbbbbbbbbb', '2024-10-02T10:00:00Z'), // lost in the newer export
    ];
    const newer = [
      entry('aaaaaaaaaaa', '2025-03-01T10:00:00Z', 'Video a (renamed)', 2), // rewatched
      entry('ccccccccccc', '2025-03-02T10:00:00Z'),
    ];
    const { videos } = mergeExports([older, newer]);
    const byId = Object.fromEntries(videos.map((v) => [v.id, v]));

    expect(Object.keys(byId).sort()).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
    expect(byId.aaaaaaaaaaa).toEqual({
      id: 'aaaaaaaaaaa',
      timestamps: [t('2024-10-01T10:00:00Z'), t('2025-03-01T10:00:00Z')],
      title: 'Video a (renamed)',
      watchmarkerCount: 2,
    });
  });

  it('does not duplicate identical timestamps from several exports', () => {
    const e = [entry('aaaaaaaaaaa', '2024-10-01T10:00:00Z')];
    expect(mergeExports([e, e]).videos[0]?.timestamps).toHaveLength(1);
  });

  it('flags days with mass entries as bulk days', () => {
    const bulk = Array.from({ length: BULK_DAY_THRESHOLD }, (_, i) =>
      entry(`bulk${String(i).padStart(7, '0')}`, '2024-06-26T12:00:00Z'),
    );
    const normal = [entry('aaaaaaaaaaa', '2024-07-01T12:00:00Z')];
    const { bulkDays } = mergeExports([[...bulk, ...normal]]);
    expect([...bulkDays]).toEqual(['2024-06-26']);
  });
});
