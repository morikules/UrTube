<script lang="ts">
  import { t } from '@/lib/i18n';
  import Toggle from './Toggle.svelte';
  import WindowInput from './WindowInput.svelte';
  import { prefs, setPref } from './prefs.svelte';

  const H = t.hide;
  const cacheHours = [
    { h: 1, label: H.hour },
    { h: 6, label: H.hours(6) },
    { h: 24, label: H.day },
    { h: 72, label: H.days(3) },
    { h: 168, label: H.week },
  ];
  const delays = [
    { ms: 100, label: H.immediately },
    ...[500, 1000, 3000, 5000].map((ms) => ({ ms, label: t.common.seconds(ms / 1000) })),
  ];
</script>

{#if prefs.s}
  {@const s = prefs.s}
  <section>
    <h2>{H.watchedTitle}</h2>
    <p class="muted">{H.watchedIntro}</p>
    <div class="box">
      <Toggle label={H.onSubs} checked={s.hideOnSubscriptions} onchange={(v) => setPref('hideOnSubscriptions', v)}>
        {#if s.hideOnSubscriptions}
          <WindowInput days={s.hideWindowSubscriptions} onchange={(d) => setPref('hideWindowSubscriptions', d)} />
        {/if}
      </Toggle>
      <Toggle label={H.onHome} checked={s.hideOnHome} onchange={(v) => setPref('hideOnHome', v)}>
        {#if s.hideOnHome}
          <WindowInput days={s.hideWindowHome} onchange={(d) => setPref('hideWindowHome', d)} />
        {/if}
      </Toggle>
      <Toggle label={H.onChannels} checked={s.hideOnChannels} onchange={(v) => setPref('hideOnChannels', v)}>
        {#if s.hideOnChannels}
          <WindowInput days={s.hideWindowChannels} onchange={(d) => setPref('hideWindowChannels', d)} />
        {/if}
      </Toggle>
      <Toggle
        label={H.onPlaylists}
        description={H.onPlaylistsDesc}
        checked={s.hideOnPlaylists}
        onchange={(v) => setPref('hideOnPlaylists', v)}
      />
      <Toggle label={H.onSearch} description={H.onSearchDesc} checked={s.hideOnSearch} onchange={(v) => setPref('hideOnSearch', v)} />
      <Toggle
        label={H.onSidebar}
        description={H.onSidebarDesc}
        checked={s.hideOnSidebar}
        onchange={(v) => setPref('hideOnSidebar', v)}
      />
    </div>
  </section>

  <section>
    <h2>{H.musicTitle}</h2>
    <p class="muted">{H.musicIntro}</p>
    <div class="box">
      <Toggle
        label={H.keepMusic}
        description={H.keepMusicDesc}
        checked={s.keepMusicVisible}
        onchange={(v) => setPref('keepMusicVisible', v)}
      />
      <Toggle
        label={H.musicCategory}
        description={H.musicCategoryDesc}
        checked={s.musicFromCategory}
        onchange={(v) => setPref('musicFromCategory', v)}
      />
    </div>
  </section>

  <section>
    <h2>{H.dismissTitle}</h2>
    <p class="muted">{H.dismissIntro}</p>
    <div class="box">
      <Toggle
        label={H.dismissVideos}
        description={H.dismissVideosDesc}
        checked={s.dismissVideos}
        onchange={(v) => setPref('dismissVideos', v)}
      />
      <Toggle
        label={H.dismissPlaylists}
        description={H.dismissPlaylistsDesc}
        checked={s.dismissPlaylists}
        onchange={(v) => setPref('dismissPlaylists', v)}
      />
      <Toggle
        label={H.dismissChannels}
        description={H.dismissChannelsDesc}
        checked={s.dismissChannels}
        onchange={(v) => setPref('dismissChannels', v)}
      />
    </div>
  </section>

  <section>
    <h2>{H.filterTitle}</h2>
    <p class="muted">{H.filterIntro}</p>
    <div class="box">
      <Toggle label={H.filterShorts} checked={s.filterShorts} onchange={(v) => setPref('filterShorts', v)} />
      <Toggle label={H.filterPremieres} checked={s.filterPremieres} onchange={(v) => setPref('filterPremieres', v)} />
      <Toggle label={H.filterLive} checked={s.filterLive} onchange={(v) => setPref('filterLive', v)} />
      <Toggle label={H.filterMembers} checked={s.filterMembersOnly} onchange={(v) => setPref('filterMembersOnly', v)} />
      <Toggle
        label={H.filterMembersChannels}
        description={H.filterMembersChannelsDesc}
        checked={s.filterMembersOnlyOnChannels}
        disabled={!s.filterMembersOnly}
        onchange={(v) => setPref('filterMembersOnlyOnChannels', v)}
      />
      <Toggle label={H.filterRelevant} checked={s.filterMostRelevant} onchange={(v) => setPref('filterMostRelevant', v)} />
    </div>
  </section>

  <section>
    <h2>{H.playlistsTitle}</h2>
    <p class="muted">{H.playlistsIntro}</p>
    <div class="box">
      <Toggle
        label={H.hideDone}
        description={H.hideDoneDesc}
        checked={s.hidePlaylistsDone}
        onchange={(v) => setPref('hidePlaylistsDone', v)}
      />
      <div class="row">
        <span class="label">{H.keepFor}</span>
        <select value={s.playlistCacheHours} onchange={(e) => setPref('playlistCacheHours', Number(e.currentTarget.value))}>
          {#each cacheHours as c}<option value={c.h}>{c.label}</option>{/each}
        </select>
      </div>
    </div>
  </section>

  <section>
    <h2>{H.refreshTitle}</h2>
    <p class="muted">{H.refreshIntro}</p>
    <div class="box">
      <div class="row">
        <span class="label">{H.interval}</span>
        <select value={s.scanDelayMs} onchange={(e) => setPref('scanDelayMs', Number(e.currentTarget.value))}>
          {#each delays as d}<option value={d.ms}>{d.label}</option>{/each}
        </select>
      </div>
    </div>
  </section>
{/if}
