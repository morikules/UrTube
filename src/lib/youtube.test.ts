import { describe, expect, it } from 'vitest';
import {
  channelKeyFromPath,
  entryFromPath,
  entryFromReferrer,
  formatDuration,
  isMusicVideo,
  isPlaylistLink,
  musicKind,
  pageKind,
  parseRelativeAge,
  playlistFromUrl,
  videoIdFromUrl,
} from './youtube';

describe('musicKind', () => {
  it('is sure for YouTube Music plays and Topic channels, else uses the category', () => {
    expect(musicKind({ isMusic: true })).toBe('sure');
    expect(musicKind({ channelName: 'Rick Astley - Topic' })).toBe('sure');
    expect(musicKind({ channelName: 'Rick Astley', category: 'Music' })).toBe('category');
    expect(musicKind({ channelName: 'Some Channel', category: 'Gaming' })).toBeNull();
    expect(isMusicVideo({ category: 'Music' }, false)).toBe(false);
    expect(isMusicVideo({ category: 'Music' }, true)).toBe(true);
  });
});

describe('videoIdFromUrl', () => {
  it.each([
    ['/watch?v=abcdefghijk', 'abcdefghijk'],
    ['https://www.youtube.com/watch?app=desktop&v=abc-efg_ijk&t=10', 'abc-efg_ijk'],
    ['/shorts/abcdefghijk', 'abcdefghijk'],
    ['https://youtu.be/abcdefghijk', 'abcdefghijk'],
    ['/@channel/videos', null],
  ])('%s → %s', (url, id) => {
    expect(videoIdFromUrl(url)).toBe(id);
  });
});

describe('playlists', () => {
  it('distinguishes playlist links from videos inside a playlist', () => {
    expect(isPlaylistLink('/watch?v=abcdefghijk&list=PL1')).toBe(true);
    expect(isPlaylistLink('/watch?v=abcdefghijk&list=PL1&index=3')).toBe(false);
    expect(isPlaylistLink('/watch?v=abcdefghijk')).toBe(false);
  });

  it('reads playlist context from a watch URL', () => {
    expect(playlistFromUrl('https://www.youtube.com/watch?v=abcdefghijk&list=PL1&index=3')).toEqual({
      playlistId: 'PL1',
      playlistIndex: 3,
    });
    expect(playlistFromUrl('/watch?v=abcdefghijk')).toEqual({
      playlistId: undefined,
      playlistIndex: undefined,
    });
  });
});

describe('entry points', () => {
  it.each([
    ['/', 'home'],
    ['/feed/subscriptions', 'subscriptions'],
    ['/results', 'search'],
    ['/@somechannel/videos', 'channel'],
    ['/channel/UC123', 'channel'],
    ['/watch', 'watch'],
    ['/shorts/abcdefghijk', 'shorts'],
    ['/playlist', 'playlist'],
    ['/feed/history', 'history'],
    ['/feed/trending', 'other'],
  ] as const)('%s → %s', (path, entry) => {
    expect(entryFromPath(path)).toBe(entry);
  });

  it('uses the referrer for the first page of a tab', () => {
    expect(entryFromReferrer('https://www.youtube.com/feed/subscriptions')).toBe('subscriptions');
    expect(entryFromReferrer('https://www.reddit.com/r/videos')).toBe('external');
    expect(entryFromReferrer('')).toBe('direct');
  });
});

describe('parseRelativeAge', () => {
  const DAY = 86_400_000;
  it.each([
    ['vor 3 Tagen', 3 * DAY],
    ['vor 1 Tag', DAY],
    ['vor 2 Wochen', 14 * DAY],
    ['vor 1 Monat', 30 * DAY],
    ['vor 5 Monaten', 150 * DAY],
    ['vor 2 Jahren', 730 * DAY],
    ['vor 7 Stunden', 7 * 3_600_000],
    ['Gestreamt vor 2 Tagen', 2 * DAY],
    ['3 days ago', 3 * DAY],
    ['Streamed 1 year ago', 365 * DAY],
  ])('%s', (text, ms) => {
    expect(parseRelativeAge(text)).toBe(ms);
  });

  it.each(['1.234 Aufrufe', 'Folge 12 vor dem Finale', '12:34', ''])('%s → null', (text) => {
    expect(parseRelativeAge(text)).toBeNull();
  });
});

describe('pageKind', () => {
  it.each([
    ['/feed/subscriptions', 'subscriptions'],
    ['/', 'home'],
    ['/@channel/videos', 'channel'],
    ['/playlist', 'playlist'],
    ['/results', 'search'],
    ['/watch', 'watch'],
    ['/feed/history', 'other'],
  ] as const)('%s → %s', (path, kind) => {
    expect(pageKind(path)).toBe(kind);
  });
});

describe('channelKeyFromPath', () => {
  it.each([
    ['/@Gronkh', '@gronkh'],
    ['/@Gronkh/videos', '@gronkh'],
    ['https://www.youtube.com/@M%C3%BCller/playlists', '@müller'],
    ['/channel/UCYJ61XIK64sp6ZFFS8sctxw', 'UCYJ61XIK64sp6ZFFS8sctxw'],
    ['/watch?v=abcdefghijk', null],
    ['/results?search_query=x', null],
  ])('%s → %s', (href, key) => {
    expect(channelKeyFromPath(href)).toBe(key);
  });
});

describe('formatDuration', () => {
  it.each([
    [5, '0:05'],
    [65, '1:05'],
    [3725, '1:02:05'],
  ])('%i → %s', (sec, text) => {
    expect(formatDuration(sec)).toBe(text);
  });
});
