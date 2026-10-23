import { describe, expect, it } from 'vitest';
import { extractSubscriptionsPage } from './subscriptions';

describe('extractSubscriptionsPage', () => {
  it('reads channels in old and new layouts, with the continuation', () => {
    const response = {
      contents: [
        {
          channelRenderer: {
            channelId: 'UC6C1dyHHOMVIBAze8dWfqCw',
            title: { simpleText: 'GameStar' },
            navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/@GameStar' } },
          },
        },
        {
          lockupViewModel: {
            contentId: 'UCz75RVbH8q2jdBJ4SnwuZZQ',
            metadata: { lockupMetadataViewModel: { title: { content: 'Blender Studio' } } },
          },
        },
        { lockupViewModel: { contentId: 'aaaaaaaaaaa', metadata: { lockupMetadataViewModel: { title: { content: 'A video' } } } } },
        { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'next' } } } },
      ],
    };
    expect(extractSubscriptionsPage(response)).toEqual({
      channels: [
        { id: 'UC6C1dyHHOMVIBAze8dWfqCw', name: 'GameStar', handle: '@GameStar' },
        { id: 'UCz75RVbH8q2jdBJ4SnwuZZQ', name: 'Blender Studio' },
      ],
      continuation: 'next',
    });
  });
});
