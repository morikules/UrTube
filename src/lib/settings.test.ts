import { describe, expect, it } from 'vitest';
import { isHidingOn, normalizeSettings, toggleHiding } from './settings';

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
        showChannelStats: true,
      });
    }
  });

  it('one switch for all, or one per area', () => {
    const global = normalizeSettings({ hideEnabled: false });
    expect(isHidingOn(global, 'home')).toBe(false);
    expect(isHidingOn(toggleHiding(global, 'channel'), 'subscriptions')).toBe(true);

    const perArea = normalizeSettings({ hideSwitchMode: 'perArea', hideAreas: { home: false } });
    expect(perArea.hideAreas).toMatchObject({ home: false, subscriptions: true, playlist: true });
    expect(isHidingOn(perArea, 'home')).toBe(false);
    expect(isHidingOn(perArea, 'subscriptions')).toBe(true);
    const flipped = toggleHiding(perArea, 'search');
    expect(flipped.hideAreas.other).toBe(false);
    expect(isHidingOn(flipped, 'watch')).toBe(false);
    expect(isHidingOn(flipped, 'subscriptions')).toBe(true);
  });

  it('stored values always win', () => {
    expect(normalizeSettings({ bigPlayer: false }).bigPlayer).toBe(false);
  });
});
