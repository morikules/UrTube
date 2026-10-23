import { beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB, clearAll, exportBackup, restoreBackup, setDismissed } from './db';
import {
  PLAYLIST_FORMAT,
  channelListId,
  channelOfPlaylistsId,
  channelPlaylistsId,
  extractChannelPlaylistsPage,
  extractPlaylistPage,
  isPlaylistStale,
  isTrackablePlaylist,
  playlistIdFromUrl,
  playlistProgress,
  progressLabel,
  type PlaylistInfo,
} from './playlists';

describe('channel lists', () => {
  const CH = 'UCz75RVbH8q2jdBJ4SnwuZZQ';

  it('builds the upload lists per kind and the playlists entry', () => {
    expect(channelListId(CH, 'videos')).toBe('UULFz75RVbH8q2jdBJ4SnwuZZQ');
    expect(channelListId(CH, 'shorts')).toBe('UUSHz75RVbH8q2jdBJ4SnwuZZQ');
    expect(channelListId(CH, 'live')).toBe('UULVz75RVbH8q2jdBJ4SnwuZZQ');
    expect(channelOfPlaylistsId(channelPlaylistsId(CH))).toBe(CH);
    expect(channelOfPlaylistsId('PLabc')).toBeNull();
  });

  it('reads Shorts from a Shorts list', () => {
    const response = {
      contents: [
        {
          shortsLockupViewModel: {
            onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'TXb8Pix1Tbs' } } },
          },
        },
        {
          shortsLockupViewModel: {
            onTap: { innertubeCommand: { commandMetadata: { webCommandMetadata: { url: '/shorts/aaaaaaaaaaa' } } } },
          },
        },
      ],
    };
    expect(extractPlaylistPage(response).videoIds).toEqual(['TXb8Pix1Tbs', 'aaaaaaaaaaa']);
  });

  it('reads playlist IDs from the Playlists tab, not videos', () => {
    const response = {
      contents: [
        { lockupViewModel: { contentId: 'PLone', contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST' } },
        { lockupViewModel: { contentId: 'aaaaaaaaaaa', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO' } },
        { gridPlaylistRenderer: { playlistId: 'PLtwo' } },
        { lockupViewModel: { contentId: 'PLone', contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST' } },
        {
          continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'next' } } },
        },
      ],
    };
    expect(extractChannelPlaylistsPage(response)).toEqual({ playlistIds: ['PLone', 'PLtwo'], continuation: 'next' });
  });
});

describe('playlistIdFromUrl', () => {
  it.each([
    ['/playlist?list=PL123', 'PL123'],
    ['/watch?v=abcdefghijk&list=PL123', 'PL123'], // thumbnail of a playlist card
    ['/watch?v=abcdefghijk&list=PL123&index=4', null], // a video inside the playlist
    ['/watch?v=abcdefghijk', null],
    ['/shorts/abcdefghijk', null],
  ])('%s → %s', (href, id) => {
    expect(playlistIdFromUrl(href)).toBe(id);
  });

  it('skips mixes and temporary lists', () => {
    expect(isTrackablePlaylist('PL123')).toBe(true);
    expect(isTrackablePlaylist('RDabcdefghijk')).toBe(false);
    expect(isTrackablePlaylist('TLGG123')).toBe(false);
  });
});

const video = (id: string) => ({ playlistVideoRenderer: { videoId: id, title: { runs: [{ text: id }] } } });

describe('extractPlaylistPage', () => {
  it('reads videos in order, the title and the continuation (first page)', () => {
    const response = {
      header: { playlistHeaderRenderer: { title: { simpleText: 'Still Standing Staffel 1' } } },
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            {
                              playlistVideoListRenderer: {
                                contents: [
                                  video('aaaaaaaaaaa'),
                                  video('bbbbbbbbbbb'),
                                  video('aaaaaaaaaaa'), // duplicate entry
                                  {
                                    continuationItemRenderer: {
                                      continuationEndpoint: { continuationCommand: { token: 'NEXT' } },
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    expect(extractPlaylistPage(response)).toEqual({
      videoIds: ['aaaaaaaaaaa', 'bbbbbbbbbbb'],
      title: 'Still Standing Staffel 1',
      continuation: 'NEXT',
    });
  });

  it('reads the layout used since 2026 (lockupViewModel + continuationItemViewModel)', () => {
    const lockup = (id: string, type = 'LOCKUP_CONTENT_TYPE_VIDEO') => ({
      lockupViewModel: { contentId: id, contentType: type, metadata: { lockupMetadataViewModel: {} } },
    });
    const response = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            lockup('4EivZahxKPU'),
                            lockup('KV4hDhXoIg4'),
                            {
                              continuationItemViewModel: {
                                trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN',
                                continuationCommand: {
                                  innertubeCommand: { continuationCommand: { token: 'NEXT2' } },
                                },
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      // Lockups outside the list (e.g. sidebar) must not count.
      sidebar: { x: lockup('zzzzzzzzzzz') },
    };
    expect(extractPlaylistPage(response)).toMatchObject({
      videoIds: ['4EivZahxKPU', 'KV4hDhXoIg4'],
      continuation: 'NEXT2',
    });
  });

  it('reads continuation pages and the new page header', () => {
    const response = {
      header: {
        pageHeaderRenderer: {
          content: {
            pageHeaderViewModel: { title: { dynamicTextViewModel: { text: { content: 'Neue Playlist' } } } },
          },
        },
      },
      onResponseReceivedActions: [
        { appendContinuationItemsAction: { continuationItems: [video('ccccccccccc')] } },
      ],
    };
    expect(extractPlaylistPage(response)).toEqual({
      videoIds: ['ccccccccccc'],
      title: 'Neue Playlist',
      continuation: undefined,
    });
  });
});

describe('isPlaylistStale', () => {
  const DAY = 86_400_000;
  const p = (fetchedAt: number, format?: number): PlaylistInfo => ({
    id: 'PL1',
    videoIds: [],
    partial: false,
    fetchedAt,
    format,
  });
  it('re-reads unknown, outdated and old-format playlists', () => {
    expect(isPlaylistStale(undefined, DAY, 10 * DAY)).toBe(true);
    expect(isPlaylistStale(p(10 * DAY - 1000, PLAYLIST_FORMAT), DAY, 10 * DAY)).toBe(false);
    expect(isPlaylistStale(p(8 * DAY, PLAYLIST_FORMAT), DAY, 10 * DAY)).toBe(true);
    expect(isPlaylistStale(p(10 * DAY - 1000), DAY, 10 * DAY)).toBe(true); // read before the format change
  });
});

describe('progress', () => {
  const p = (ids: string[], partial = false): PlaylistInfo => ({ id: 'PL1', videoIds: ids, partial, fetchedAt: 0 });
  const watched = new Set(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  const isWatched = (id: string) => watched.has(id);

  it('counts watched videos and recognises finished playlists', () => {
    expect(progressLabel(playlistProgress(p(['aaaaaaaaaaa', 'ccccccccccc']), isWatched))).toBe('1 / 2 watched');
    const done = playlistProgress(p(['aaaaaaaaaaa', 'bbbbbbbbbbb']), isWatched);
    expect(done.done).toBe(true);
    expect(progressLabel(done)).toBe('✓ 2 / 2 watched');
  });

  it('a partly read playlist is never "done"', () => {
    const pr = playlistProgress(p(['aaaaaaaaaaa', 'bbbbbbbbbbb'], true), isWatched);
    expect(pr.done).toBe(false);
    expect(progressLabel(pr)).toBe('2 / 2+ watched');
  });

  it('an empty playlist is not "done"', () => {
    expect(playlistProgress(p([]), isWatched).done).toBe(false);
  });
});

describe('dismissed', () => {
  let db: TrackerDB;
  let n = 0;
  beforeEach(() => {
    db = new TrackerDB(`dismissed-${n++}`);
  });

  it('is kept apart from the watch history and included in backups', async () => {
    await setDismissed(db, { id: 'aaaaaaaaaaa', kind: 'video', title: 'A' }, true);
    await setDismissed(db, { id: 'PL1', kind: 'playlist' }, true);
    await setDismissed(db, { id: 'PL1', kind: 'playlist' }, false);
    expect(await db.dismissed.toCollection().primaryKeys()).toEqual(['aaaaaaaaaaa']);
    expect(await db.videos.count()).toBe(0);
    expect(await db.views.count()).toBe(0);

    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    await clearAll(db);
    expect(await db.dismissed.count()).toBe(0);
    await restoreBackup(db, backup);
    expect(await db.dismissed.get('aaaaaaaaaaa')).toMatchObject({ kind: 'video', title: 'A' });
  });
});
