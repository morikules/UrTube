import { describe, expect, it } from 'vitest';
import { normalizeSettings } from './settings';

describe('normalizeSettings', () => {
  it('gives new installs the conservative defaults', () => {
    const s = normalizeSettings(undefined);
    expect(s).toMatchObject({ bigPlayer: false, filterShorts: false, removeFromYoutubeHistory: false, language: 'auto' });
  });

  it('keeps the earlier defaults for existing installs', () => {
    const s = normalizeSettings({ hideOnHome: false });
    expect(s).toMatchObject({ bigPlayer: true, filterShorts: true, removeFromYoutubeHistory: true, hideOnHome: false });
  });

  it('new options of 1.0.2 start off, also for existing installs', () => {
    for (const s of [normalizeSettings(undefined), normalizeSettings({ hideOnHome: false })]) {
      expect(s).toMatchObject({
        pauseChannelTrailer: false,
        filterMembersOnlyOnChannels: false,
        fetchMissingMeta: true,
        fetchMissingMetaAll: false,
      });
    }
  });

  it('stored values always win', () => {
    expect(normalizeSettings({ bigPlayer: false }).bigPlayer).toBe(false);
  });
});
