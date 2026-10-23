import { describe, expect, it } from 'vitest';
import type { Video, View } from './db';
import { inDateRange, lengthMatches, resumePoints, toCsv, videosCsv } from './history';

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

  it('one line per video with link', () => {
    const csv = videosCsv([video('aaaaaaaaaaa', { title: 'T', channelName: 'C', isShort: true })]);
    expect(csv.split('\r\n')[1]).toContain('aaaaaaaaaaa;T;C;;https://www.youtube.com/shorts/aaaaaaaaaaa;watched;1');
  });
});
