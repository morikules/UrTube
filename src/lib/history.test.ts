import { describe, expect, it } from 'vitest';
import type { Video, View } from './db';
import {
  abandonedVideos,
  inDateRange,
  lengthMatches,
  originsByVideo,
  resumePoints,
  toCsv,
  videosCsv,
} from './history';

const video = (id: string, extra: Partial<Video> = {}): Video => ({
  id,
  title: id,
  status: 'watched',
  firstViewAt: 0,
  lastViewAt: 0,
  viewCount: 1,
  ...extra,
});
const view = (videoId: string, at: number, extra: Partial<View> = {}): View => ({
  videoId,
  at,
  kind: 'watch',
  source: 'extension',
  dateUncertain: false,
  ...extra,
});

describe('resumePoints', () => {
  it('only the latest recorded view counts, if unfinished and far enough', () => {
    const points = resumePoints(
      [
        view('aaaaaaaaaaa', 1, { maxPosition: 600, finishedAt: 2, durationSec: 620 }),
        view('aaaaaaaaaaa', 3, { maxPosition: 300, lastPosition: 290, durationSec: 620 }), // rewatch, stopped
        view('bbbbbbbbbbb', 1, { maxPosition: 10, durationSec: 600 }), // only a quick look
        view('ccccccccccc', 1, { maxPosition: 590, durationSec: 600 }), // 98 %: as good as finished
        view('ddddddddddd', 1, { maxPosition: 400, kind: 'imported', source: 'watchmarker' }),
      ],
      0.9,
    );
    expect([...points]).toEqual([['aaaaaaaaaaa', 290]]);
  });
});

describe('tags', () => {
  it('given up: unfinished and not continued for three months (paused ones are not)', () => {
    const DAY = 86_400_000;
    const now = 1000 * DAY;
    const set = abandonedVideos(
      [
        view('aaaaaaaaaaa', now - 120 * DAY, { maxPosition: 60, durationSec: 600 }),
        view('bbbbbbbbbbb', now - 120 * DAY, { maxPosition: 60, durationSec: 600 }),
        view('bbbbbbbbbbb', now - 100 * DAY, { maxPosition: 590, durationSec: 600, finishedAt: 1 }), // finished later
        view('ccccccccccc', now - 10 * DAY, { maxPosition: 30, durationSec: 600 }), // paused, still watching
      ],
      now,
    );
    expect([...set]).toEqual(['aaaaaaaaaaa']);
  });

  it('origins of the views', () => {
    const map = originsByVideo([
      view('aaaaaaaaaaa', 1),
      view('aaaaaaaaaaa', 2, { kind: 'imported', source: 'watchmarker' }),
      view('bbbbbbbbbbb', 1, { kind: 'marked', source: 'youtube-progress' }),
    ]);
    expect([...map.get('aaaaaaaaaaa')!]).toEqual(['here', 'watchmarker']);
    expect([...map.get('bbbbbbbbbbb')!]).toEqual(['youtube-progress']);
  });
});

describe('filters', () => {
  it('length ranges; unknown length only under "all"', () => {
    expect(lengthMatches(video('a', { durationSec: 45 }), 'under1')).toBe(true);
    expect(lengthMatches(video('a', { durationSec: 3700 }), 'over60')).toBe(true);
    expect(lengthMatches(video('a', { durationSec: 600 }), 'to10')).toBe(false);
    expect(lengthMatches(video('a'), 'to30')).toBe(false);
    expect(lengthMatches(video('a'), 'all')).toBe(true);
  });

  it('date range: some view between the two days', () => {
    const v = video('a', { firstViewAt: Date.parse('2026-10-01T10:00:00'), lastViewAt: Date.parse('2026-10-10T10:00:00') });
    expect(inDateRange(v, '2026-10-05', '2026-10-06')).toBe(true);
    expect(inDateRange(v, '2026-10-11', '')).toBe(false);
    expect(inDateRange(v, '', '2026-09-30')).toBe(false);
    expect(inDateRange(v, '', '')).toBe(true);
  });
});

describe('CSV', () => {
  it('separator ";", quotes where needed, BOM for Excel', () => {
    expect(toCsv(['a', 'b'], [['x;y', 'say "hi"'], [1, undefined]])).toBe('﻿a;b\r\n"x;y";"say ""hi"""\r\n1;\r\n');
  });

  it('texts that look like formulas are not run', () => {
    expect(toCsv(['a'], [['=HYPERLINK("x")'], ['-abc'], [-5]])).toBe('﻿a\r\n"\'=HYPERLINK(""x"")"\r\n\'-abc\r\n-5\r\n');
  });

  it('one line per video with link', () => {
    const csv = videosCsv([video('aaaaaaaaaaa', { title: 'T', channelName: 'C', isShort: true })]);
    expect(csv.split('\r\n')[1]).toContain('aaaaaaaaaaa;T;C;;https://www.youtube.com/shorts/aaaaaaaaaaa;watched;1');
  });
});
