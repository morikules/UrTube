import { describe, expect, it } from 'vitest';
import type { Video, View } from './db';
import { computeHighlights, computeStats, formatWatchTime, granularityFor, rangeFor } from './stats';

const t = (iso: string) => Date.parse(iso);
const video = (id: string, extra: Partial<Video> = {}): Video => ({
  id,
  title: id,
  status: 'watched',
  firstViewAt: 0,
  lastViewAt: 0,
  viewCount: 1,
  ...extra,
});
const view = (videoId: string, iso: string, extra: Partial<View> = {}): View => ({
  videoId,
  at: t(iso),
  kind: 'watch',
  source: 'extension',
  dateUncertain: false,
  ...extra,
});

const videos = [
  video('aaaaaaaaaaa', { channelName: 'Kanal X' }),
  video('bbbbbbbbbbb', { channelName: 'Kanal X', isShort: true }),
  video('ccccccccccc', { channelName: 'Kanal Y' }),
  video('ddddddddddd'),
];
const views = [
  view('aaaaaaaaaaa', '2026-08-03T10:00:00Z', { watchedSeconds: 600, finishedAt: 1, entry: 'subscriptions' }),
  view('aaaaaaaaaaa', '2026-08-20T10:00:00Z', { watchedSeconds: 120, entry: 'home' }),
  view('bbbbbbbbbbb', '2026-10-01T10:00:00Z', { watchedSeconds: 30, finishedAt: 1, entry: 'subscriptions' }),
  view('ccccccccccc', '2026-10-05T10:00:00Z', { kind: 'imported', source: 'youtube-history' }),
  view('ddddddddddd', '2024-06-26T10:00:00Z', { kind: 'imported', source: 'watchmarker', dateUncertain: true }),
];

describe('computeStats', () => {
  it('"everything" also counts videos without a real date, separately reported', () => {
    const s = computeStats(videos, views, { from: null, to: t('2026-10-20T00:00:00Z') });
    expect(s).toMatchObject({
      videos: 4,
      undatedVideos: 1,
      views: 5,
      watchedSeconds: 750,
      sessions: 3,
      finished: 2,
      shorts: 1,
      unknownChannel: 1,
      topChannels: [
        { label: 'Kanal X', count: 2 },
        { label: 'Kanal Y', count: 1 },
      ],
      entries: [
        { entry: 'subscriptions', count: 2 },
        { entry: 'home', count: 1 },
      ],
    });
  });

  it('a bounded range ignores undated views', () => {
    const s = computeStats(videos, views, { from: t('2024-01-01T00:00:00Z'), to: t('2026-10-20T00:00:00Z') });
    expect(s.videos).toBe(3);
    expect(s.undatedVideos).toBe(0);
  });

  it('long ranges are split by month, also empty months', () => {
    const s = computeStats(videos, views, { from: null, to: t('2026-10-20T00:00:00Z') });
    expect(s.granularity).toBe('month');
    expect(s.buckets.map((m) => [m.key, m.videos])).toEqual([
      ['2026-08', 1], // one video watched twice in August
      ['2026-09', 0],
      ['2026-10', 2],
    ]);
  });

  it('short ranges are split by day', () => {
    const s = computeStats(videos, views, { from: t('2026-09-29T22:00:00Z'), to: t('2026-10-06T12:00:00Z') });
    expect(s.granularity).toBe('day');
    expect(s.buckets[0]).toMatchObject({ key: '2026-09-30', label: '09/30' });
    expect(s.buckets.find((b) => b.key === '2026-10-01')?.videos).toBe(1);
    expect(s.buckets.at(-1)?.key).toBe('2026-10-06');
  });
});

describe('computeHighlights', () => {
  const vids = [
    video('aaaaaaaaaaa', { channelId: 'UCx', channelName: 'X', category: 'Gaming' }),
    video('bbbbbbbbbbb', { channelId: 'UCx', channelName: 'X', category: 'Gaming' }),
    video('ccccccccccc', { channelId: 'UCy', channelName: 'Y', category: 'Education' }),
    video('ddddddddddd'),
  ];
  const vws = [
    view('aaaaaaaaaaa', '2026-10-01T10:00:00Z'),
    view('aaaaaaaaaaa', '2026-10-02T10:00:00Z'),
    view('aaaaaaaaaaa', '2026-10-03T10:00:00Z'),
    view('bbbbbbbbbbb', '2026-10-03T12:00:00Z'),
    view('ccccccccccc', '2026-10-10T10:00:00Z'),
    view('ccccccccccc', '2026-10-11T10:00:00Z'),
    view('ddddddddddd', '2024-01-01T10:00:00Z', { dateUncertain: true }),
  ];
  const range = { from: t('2026-10-01T00:00:00Z'), to: t('2026-10-12T00:00:00Z') };
  const buckets = [{ key: '2026-10', label: 'Oct' }];
  const h = computeHighlights(vids, vws, range, buckets, 'month', 10, t('2026-10-11T18:00:00Z'));

  it('most rewatched videos and categories', () => {
    expect(h.rewatched).toEqual([
      { id: 'aaaaaaaaaaa', title: 'aaaaaaaaaaa', channelName: 'X', count: 3 },
      { id: 'ccccccccccc', title: 'ccccccccccc', channelName: 'Y', count: 2 },
    ]);
    expect(h.categories).toEqual([
      { label: 'Gaming', count: 2 },
      { label: 'Education', count: 1 },
    ]);
  });

  it('streaks, busiest day, new channels and the first video', () => {
    expect(h.longestStreak).toEqual({ days: 3, from: '2026-10-01', to: '2026-10-03' });
    expect(h.currentStreak).toBe(2);
    expect(h.busiestDay).toEqual({ day: '2026-10-03', videos: 2 });
    expect(h.newChannelsTotal).toBe(2);
    expect(h.newChannels).toEqual([{ key: '2026-10', label: 'Oct', channels: 2 }]);
    expect(h.first?.id).toBe('aaaaaaaaaaa');
  });
});

describe('granularityFor', () => {
  const DAY = 86_400_000;
  it.each([
    [7, 'day'],
    [31, 'day'],
    [90, 'week'],
    [180, 'week'],
    [365, 'month'],
  ] as const)('%i days → %s', (days, g) => {
    expect(granularityFor(0, days * DAY)).toBe(g);
  });
});

describe('rangeFor', () => {
  const now = new Date(2026, 9, 20, 15, 0); // 20.10.2026 local time
  it('last month is the whole previous calendar month', () => {
    const r = rangeFor('lastMonth', now);
    expect(new Date(r.from!).getDate()).toBe(1);
    expect(new Date(r.from!).getMonth()).toBe(8);
    expect(new Date(r.to).getMonth()).toBe(8);
    expect(new Date(r.to).getDate()).toBe(30);
  });

  it('last 3 months = this month and the two before', () => {
    expect(new Date(rangeFor('3m', now).from!).getMonth()).toBe(7);
  });

  it('last year is the whole previous calendar year', () => {
    const r = rangeFor('lastYear', now);
    expect(new Date(r.from!).getFullYear()).toBe(2025);
    expect(new Date(r.to).getFullYear()).toBe(2025);
  });
});

describe('formatWatchTime', () => {
  it.each([
    [45 * 60, '45 min'],
    [9.5 * 3600, '9 h 30 min'],
    [125 * 3600, '5 days 5 h'],
  ])('%i s → %s', (sec, text) => {
    expect(formatWatchTime(sec)).toBe(text);
  });
});
