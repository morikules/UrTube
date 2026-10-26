<script lang="ts">
  import { t } from '@/lib/i18n';
  import { HIDE_AREAS, type Settings } from '@/lib/settings';
  import Toggle from './Toggle.svelte';
  import WindowInput from './WindowInput.svelte';
  import { prefs, setPref } from './prefs.svelte';

  const H = t.hide;
  const modes: { id: Settings['hideSwitchMode']; label: string; description: string }[] = [
    { id: 'global', label: H.modeGlobal, description: H.modeGlobalDesc },
    { id: 'perArea', label: H.modePerArea, description: H.modePerAreaDesc },
  ];
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
    <h2>{H.switchModeTitle}</h2>
    <p class="muted">{H.switchModeIntro}</p>
    <div class="box">
      {#each modes as m}
        <label class="choice">
          <span class="text">
            <span class="label">{m.label}</span>
            <span class="description">{m.description}</span>
          </span>
          <input
            type="radio"
            name="switch-mode"
            value={m.id}
            checked={s.hideSwitchMode === m.id}
            onchange={() => setPref('hideSwitchMode', m.id)}
          />
        </label>
        {#if m.id === 'perArea' && s.hideSwitchMode === 'perArea'}
          <div class="areas">
            {#each HIDE_AREAS as area}
              <Toggle
                label={H.areas[area]}
                checked={s.hideAreas[area]}
                onchange={(v) => setPref('hideAreas', { ...s.hideAreas, [area]: v })}
              />
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  </section>

  <section>
    <h2>{H.membersTitle}</h2>
    <p class="muted">{H.membersIntro}</p>
    <div class="box">
      <Toggle label={H.filterMembers} checked={s.filterMembersOnly} onchange={(v) => setPref('filterMembersOnly', v)} />
      <Toggle
        label={H.filterMembersChannels}
        description={H.filterMembersChannelsDesc}
        checked={s.filterMembersOnlyOnChannels}
        disabled={!s.filterMembersOnly}
        onchange={(v) => setPref('filterMembersOnlyOnChannels', v)}
      />
      <Toggle
        label={H.membersInStats}
        description={H.membersInStatsDesc}
        checked={s.hideMembersInChannelStats}
        onchange={(v) => setPref('hideMembersInChannelStats', v)}
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
      <Toggle
        label={H.dismissAlways}
        description={H.dismissAlwaysDesc}
        checked={s.dismissAlwaysHidden}
        onchange={(v) => setPref('dismissAlwaysHidden', v)}
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
      <Toggle
        label={H.filterReplays}
        description={H.filterReplaysDesc}
        checked={s.filterStreamReplays}
        disabled={!s.filterLive}
        onchange={(v) => setPref('filterStreamReplays', v)}
      />
      <Toggle
        label={H.filterRelevant}
        description={H.filterRelevantDesc}
        checked={s.filterMostRelevant}
        onchange={(v) => setPref('filterMostRelevant', v)}
      />
      <Toggle label={H.filtersOnHome} checked={s.filtersOnHome} onchange={(v) => setPref('filtersOnHome', v)} />
      <Toggle
        label={H.filtersOnSidebar}
        description={H.filtersOnSidebarDesc}
        checked={s.filtersOnSidebar}
        onchange={(v) => setPref('filtersOnSidebar', v)}
      />
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

<style>
  /* Same layout as a Toggle row: text left, control right. */
  .choice {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }
  .choice:last-child {
    border-bottom: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .description {
    color: var(--muted);
    font-size: 0.88em;
  }
  /* Own radio: same height as the switches below and centered under them (38 px wide). */
  .choice input {
    appearance: none;
    flex: none;
    box-sizing: border-box;
    width: 22px;
    height: 22px;
    margin: 0 8px 0 0;
    border: 2px solid var(--border);
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }
  .choice input:checked {
    border-color: var(--accent);
    background: radial-gradient(var(--accent) 0 5px, transparent 6px);
  }
  .choice input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* The areas belong to "a switch per area": indented below it. */
  .areas {
    padding-left: 20px;
    border-top: 1px solid var(--border);
  }
</style>
