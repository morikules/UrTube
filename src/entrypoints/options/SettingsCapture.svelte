<script lang="ts">
  import { n, t } from '@/lib/i18n';
  import { formatDateTime } from '@/lib/youtube';
  import { REMOVAL_RESULT_KEY, type RemovalResult } from '@/lib/youtubeHistory';
  import Notice from './Notice.svelte';
  import Toggle from './Toggle.svelte';
  import type { Settings } from '@/lib/settings';
  import { prefs, setPref } from './prefs.svelte';

  const C = t.capture;
  let error = $state('');
  let removal = $state<RemovalResult | null>(null);

  const openDelays = [500, 1000, 2000, 5000, 10000, 30000].map((ms) => ({ ms, label: t.common.seconds(ms / 1000) }));
  const syncIntervals = [15, 30, 60, 180, 360, 1440].map((min) => ({
    min,
    label: min < 60 ? C.everyMinutes(min) : min === 60 ? C.hourly : min === 1440 ? C.daily : C.everyHours(min / 60),
  }));

  browser.storage.local.get(REMOVAL_RESULT_KEY).then((stored) => {
    removal = (stored[REMOVAL_RESULT_KEY] as RemovalResult | undefined) ?? null;
  });

  // The YouTube tab writes removal results to storage; show them live.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[REMOVAL_RESULT_KEY]) {
      removal = (changes[REMOVAL_RESULT_KEY].newValue as RemovalResult) ?? null;
    }
  });

  async function toggleBrowserHistory(on: boolean) {
    error = '';
    if (on) {
      // Must be the first await in the click handler (user gesture).
      const granted = await browser.permissions.request({ permissions: ['history'] });
      if (!granted) {
        error = t.common.noHistoryPermission;
        return;
      }
    }
    await setPref('markFromBrowserHistory', on);
  }

  const removalText = (r: RemovalResult) =>
    [C.removed(n(r.removed)), r.notFound ? C.notFound(n(r.notFound)) : '', r.failed ? C.failed(n(r.failed)) : '']
      .filter(Boolean)
      .join(', ');
</script>

<Notice {error} />

{#if prefs.s}
  {@const s = prefs.s}
  <section>
    <h2>{C.title}</h2>
    <p class="muted">{C.intro}</p>
    <div class="box">
      <Toggle label={C.onOpen} description={C.onOpenDesc} checked={s.markOnOpen} onchange={(v) => setPref('markOnOpen', v)}>
        {#if s.markOnOpen}
          <label>
            {C.after}
            <select value={s.openDelayMs} onchange={(e) => setPref('openDelayMs', Number(e.currentTarget.value))}>
              {#each openDelays as d}<option value={d.ms}>{d.label}</option>{/each}
            </select>
          </label>
        {/if}
      </Toggle>
      <Toggle label={C.onPlay} description={C.onPlayDesc} checked={s.markOnPlay} onchange={(v) => setPref('markOnPlay', v)} />
      <Toggle
        label={C.progressBar}
        description={C.progressBarDesc}
        checked={s.markFromProgressBar}
        onchange={(v) => setPref('markFromProgressBar', v)}
      />
      <Toggle
        label={C.browserHistory}
        description={C.browserHistoryDesc}
        checked={s.markFromBrowserHistory}
        onchange={toggleBrowserHistory}
      />
      <Toggle
        label={C.youtubeHistory}
        description={C.youtubeHistoryDesc}
        checked={s.markFromYoutubeHistory}
        onchange={(v) => setPref('markFromYoutubeHistory', v)}
      />
      <div class="row">
        <span class="label">{C.autoSync}</span>
        <select value={s.syncIntervalMin} onchange={(e) => setPref('syncIntervalMin', Number(e.currentTarget.value))}>
          {#each syncIntervals as i}<option value={i.min}>{i.label}</option>{/each}
        </select>
      </div>
      <Toggle label={C.shorts} description={C.shortsDesc} checked={s.recordShorts} onchange={(v) => setPref('recordShorts', v)} />
      <Toggle
        label={C.recordMusic}
        description={C.recordMusicDesc}
        checked={s.recordYoutubeMusic}
        onchange={(v) => setPref('recordYoutubeMusic', v)}
      />
      <div class="row">
        <label>
          {C.finishedFrom}
          <input
            class="pct"
            type="number"
            min="10"
            max="100"
            step="5"
            value={Math.round(s.finishedThreshold * 100)}
            onchange={(e) => setPref('finishedThreshold', Number(e.currentTarget.value) / 100)}
          />
          {C.percentOfVideo}
        </label>
      </div>
    </div>
  </section>

  <section>
    <h2>{C.watchLaterTitle}</h2>
    <p class="muted">{C.watchLaterIntro}</p>
    <div class="box">
      <div class="row">
        <span class="label">{C.removeWatched}</span>
        <select
          value={s.cleanWatchLater}
          onchange={(e) => setPref('cleanWatchLater', e.currentTarget.value as Settings['cleanWatchLater'])}
        >
          <option value="off">{C.wlOff}</option>
          <option value="opened">{C.wlOpened}</option>
          <option value="finished">{C.wlFinished}</option>
        </select>
      </div>
    </div>
  </section>

  <section>
    <h2>{C.deleteTitle}</h2>
    <p class="muted">{C.deleteIntro}</p>
    <div class="box">
      <Toggle
        label={C.removeYt}
        description={C.removeYtDesc}
        checked={s.removeFromYoutubeHistory}
        onchange={(v) => setPref('removeFromYoutubeHistory', v)}
      >
        {#if removal}
          <span class="muted small">
            {C.lastRun(formatDateTime(removal.at))}
            {removalText(removal)}
            {#if removal.error}<span class="error"> – {removal.error}</span>{/if}
          </span>
        {/if}
      </Toggle>
    </div>
  </section>
{/if}

<style>
  .pct {
    width: 4em;
  }
</style>
