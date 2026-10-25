import { beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB, addExternalViews, startView } from './db';
import { dayToTimestamp, extractHistoryPage, findRemovalToken, parseSectionDate } from './youtubeHistory';

// Wednesday, 2026-10-21, 15:00 in Berlin
const NOW = Date.parse('2026-10-21T13:00:00Z');

describe('parseSectionDate', () => {
  it.each([
    ['Heute', '2026-10-21'],
    ['Gestern', '2026-10-20'],
    ['Today', '2026-10-21'],
    ['Montag', '2026-10-19'],
    ['Mittwoch', '2026-10-14'], // same weekday as today = one week ago
    ['Sunday', '2026-10-18'],
    ['12. Okt.', '2026-10-12'],
    ['3. März', '2026-03-03'],
    ['24. Dez.', '2025-12-24'], // no year and in the future → last year
    ['5. Jan. 2024', '2024-01-05'],
    ['Oct 12', '2026-10-12'],
    ['Dec 24, 2023', '2023-12-24'],
  ])('%s → %s', (text, day) => {
    expect(parseSectionDate(text, NOW)).toBe(day);
  });

  it('returns null for unknown headers', () => {
    expect(parseSectionDate('Shorts', NOW)).toBeNull();
  });
});

/** Minimal browse response in YouTube's shape (old and new renderers). */
function section(title: string, contents: unknown[]) {
  return {
    itemSectionRenderer: {
      header: { itemSectionHeaderRenderer: { title: { runs: [{ text: title }] } } },
      contents,
    },
  };
}

const response = {
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  section('Heute', [
                    { videoRenderer: { videoId: 'aaaaaaaaaaa', title: { runs: [{ text: 'Video A' }] } } },
                    {
                      lockupViewModel: {
                        contentId: 'bbbbbbbbbbb',
                        contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
                        metadata: { lockupMetadataViewModel: { title: { content: 'Video B' } } },
                      },
                    },
                    {
                      reelShelfRenderer: {
                        items: [
                          {
                            shortsLockupViewModel: {
                              entityId: 'shorts-shelf-item-ccccccccccc',
                              overlayMetadata: { primaryText: { content: 'Short C' } },
                            },
                          },
                        ],
                      },
                    },
                  ]),
                  section('12. Okt.', [
                    { videoRenderer: { videoId: 'aaaaaaaaaaa', title: { simpleText: 'Video A' } } },
                    { lockupViewModel: { contentId: 'PLxyz', contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST' } },
                  ]),
                  {
                    continuationItemRenderer: {
                      continuationEndpoint: { continuationCommand: { token: 'NEXT' } },
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

describe('extractHistoryPage', () => {
  it('reads videos per day from old and new layouts plus the continuation', () => {
    const page = extractHistoryPage(response, NOW);
    expect(page.continuation).toBe('NEXT');
    expect(page.items).toEqual([
      { videoId: 'aaaaaaaaaaa', title: 'Video A', day: '2026-10-21' },
      { videoId: 'bbbbbbbbbbb', title: 'Video B', day: '2026-10-21' },
      { videoId: 'ccccccccccc', title: 'Short C', isShort: true, day: '2026-10-21' },
      { videoId: 'aaaaaaaaaaa', title: 'Video A', day: '2026-10-12' },
    ]);
  });

  it('reads continuation pages', () => {
    const next = {
      onResponseReceivedActions: [
        { appendContinuationItemsAction: { continuationItems: [section('Gestern', [
          { videoRenderer: { videoId: 'ddddddddddd', title: { runs: [{ text: 'D' }] } } },
        ])] } },
      ],
    };
    expect(extractHistoryPage(next, NOW)).toMatchObject({
      items: [{ videoId: 'ddddddddddd', title: 'D', day: '2026-10-20' }],
      continuation: undefined,
      unknownHeaders: [],
    });
  });

  it('reports unknown headers and reads the removal token from the menu', () => {
    const page = extractHistoryPage(
      section('Irgendwann', [
        {
          videoRenderer: {
            videoId: 'eeeeeeeeeee',
            title: { simpleText: 'E' },
            menu: {
              menuRenderer: {
                items: [
                  {
                    menuServiceItemRenderer: {
                      serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'TOKEN-E' } },
                    },
                  },
                ],
              },
            },
          },
        },
      ]),
      NOW,
    );
    expect(page.unknownHeaders).toEqual(['Irgendwann']);
    expect(page.items).toEqual([{ videoId: 'eeeeeeeeeee', title: 'E', day: null, removalToken: 'TOKEN-E' }]);
  });

  it('keeps a shortened sample of a video without removal token', () => {
    const page = extractHistoryPage(
      section('Heute', [
        { lockupViewModel: { contentId: 'fffffffffff', metadata: { long: 'x'.repeat(200) } } },
      ]),
      NOW,
    );
    const sample = JSON.parse(page.missingTokenSample!);
    // Only the structure, no content.
    expect(sample.lockupViewModel.contentId).toBe('<11>');
    expect(sample.lockupViewModel.metadata.long).toBe('<200>');
  });

  it('picks the menu entry with the DELETE icon (new layout, as in Watchmarker)', () => {
    const listItem = (icon: string, token: string) => ({
      listItemViewModel: {
        leadingImage: { sources: [{ clientResource: { imageName: icon } }] },
        rendererContext: {
          commandContext: { onTap: { innertubeCommand: { feedbackEndpoint: { feedbackToken: token } } } },
        },
      },
    });
    const lockup = {
      contentId: 'ggggggggggg',
      metadata: {
        lockupMetadataViewModel: {
          menuButton: {
            buttonViewModel: {
              onTap: {
                innertubeCommand: {
                  showSheetCommand: {
                    panelLoadingStrategy: {
                      inlineContent: {
                        sheetViewModel: {
                          content: {
                            listViewModel: {
                              listItems: [listItem('NOT_INTERESTED', 'WRONG'), listItem('DELETE', 'RIGHT')],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(findRemovalToken(lockup)).toBe('RIGHT');
    // Several feedback entries but none marked DELETE: do not guess.
    expect(findRemovalToken({ a: listItem('X', '1'), b: listItem('Y', '2') })).toBeUndefined();
  });

  it('reads numeric dates', () => {
    expect(parseSectionDate('03.11.2023', NOW)).toBe('2023-11-03');
  });
});

describe('day-only views', () => {
  let db: TrackerDB;
  let n = 0;
  beforeEach(() => {
    db = new TrackerDB(`yth-${n++}`);
  });

  it('only add videos that are missing, and repeat syncs add nothing', async () => {
    await startView(db, { videoId: 'aaaaaaaaaaa', title: 'A', at: Date.parse('2026-10-21T07:30:00Z') });
    const views = [
      { videoId: 'aaaaaaaaaaa', at: dayToTimestamp('2026-10-21', NOW), dayOnly: true },
      { videoId: 'aaaaaaaaaaa', at: dayToTimestamp('2026-10-12', NOW), dayOnly: true },
      { videoId: 'bbbbbbbbbbb', at: dayToTimestamp('2026-10-12', NOW), dayOnly: true },
    ];
    expect((await addExternalViews(db, 'youtube-history', views)).added).toBe(1); // only the unknown B
    expect((await addExternalViews(db, 'youtube-history', views)).added).toBe(0);
    expect((await db.videos.get('aaaaaaaaaaa'))?.viewCount).toBe(1);
  });

  it('today is not dated into the future', () => {
    const morning = Date.parse('2026-10-21T06:00:00Z');
    expect(dayToTimestamp('2026-10-21', morning)).toBe(morning);
  });
});
