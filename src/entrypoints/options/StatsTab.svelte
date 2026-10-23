<script lang="ts">
  import { TrackerDB, type Video, type View } from '@/lib/db';
  import { n as fmt, t } from '@/lib/i18n';
  import { RANGE_IDS, computeStats, formatWatchTime, rangeFor, type RangeId } from '@/lib/stats';
  import BarList from './BarList.svelte';
  import ChannelList from './ChannelList.svelte';
  import ColumnChart from './ColumnChart.svelte';
  import Dropdown from './Dropdown.svelte';

  /** `dataVersion` changes whenever the background reports new data. */
  let { dataVersion }: { dataVersion: number } = $props();

  const T = t.stats;
  const ranges = RANGE_IDS.map((id) => ({ id, label: T.ranges[id] }));
  let rangeId = $state<RangeId>('30d');
  let showAllChannels = $state(false);

  // raw: tens of thousands of rows, replaced as a whole on reload
  let videos = $state.raw<Video[]>([]);
  let views = $state.raw<View[]>([]);
  let loading = $state(true);

  $effect(() => {
    void dataVersion;
    const db = new TrackerDB();
    Promise.all([db.videos.toArray(), db.views.toArray()]).then(([v, w]) => {
      videos = v;
      views = w;
      loading = false;
    });
  });

  const stats = $derived(computeStats(videos, views, rangeFor(rangeId)));

  const finishedPct = $derived(stats.sessions ? Math.round((stats.finished / stats.sessions) * 100) : 0);
</script>

<section class="viz">
  <div class="toolbar">
    <Dropdown label={T.range} options={ranges} value={rangeId} onchange={(r) => (rangeId = r)} />
  </div>

  {#if loading}
    <p class="muted">{t.common.loading}</p>
  {:else}
    <div class="tiles">
      <div class="tile"><span>{T.watchedVideos}</span><b>{fmt(stats.videos)}</b></div>
      <div class="tile"><span>{T.shorts}</span><b>{fmt(stats.shorts)}</b></div>
      <div class="tile">
        <span>{T.watchTime}</span><b>{formatWatchTime(stats.watchedSeconds)}</b>
      </div>
      <div class="tile">
        <span>{T.finished}</span><b>{finishedPct} %</b>
        <small class="muted">{T.finishedOf(fmt(stats.finished), fmt(stats.sessions))}</small>
      </div>
    </div>
    <p class="muted small">
      {T.noteExtension}
      {#if rangeId === 'all'}
        {#if stats.undatedVideos}{T.noteUndatedAll(fmt(stats.undatedVideos))}{/if}
      {:else}
        {T.noteUndated}
      {/if}
    </p>

    <h2>{T.chartTitle(T.per[stats.granularity])}</h2>
    <div class="box chart-box">
      <ColumnChart
        data={stats.buckets.map((b) => ({
          label: stats.granularity === 'week' ? T.weekFrom(b.label) : b.label,
          value: b.videos,
        }))}
        unit={(v) => t.common.videos(fmt(v))}
      />
    </div>

    <div class="cols">
      <div>
        <h2>{T.topChannels}</h2>
        <div class="box list-box">
          {#if stats.topChannels.length}
            <BarList rows={stats.topChannels} unit={(c) => t.common.videos(fmt(c))} />
          {:else}
            <p class="muted">{T.noChannels}</p>
          {/if}
          {#if stats.unknownChannel}
            <p class="muted small">{T.unknownChannel(fmt(stats.unknownChannel))}</p>
          {/if}
          <button class="all-channels" onclick={() => (showAllChannels = !showAllChannels)} aria-expanded={showAllChannels}>
            {showAllChannels ? T.channels.hideAll : T.channels.showAll}
          </button>
        </div>
      </div>
      <div>
        <h2>{T.entriesTitle}</h2>
        <div class="box list-box">
          {#if stats.entries.length}
            <BarList
              rows={stats.entries.map((e) => ({ label: t.entries[e.entry], count: e.count }))}
              unit={(c) => t.common.sessions(fmt(c))}
            />
          {:else}
            <p class="muted">{T.noSessions}</p>
          {/if}
        </div>
      </div>
    </div>

    {#if showAllChannels}
      <h2>{T.channels.title}</h2>
      <p class="muted">{T.channels.intro}</p>
      <div class="box list-box">
        <ChannelList {videos} />
      </div>
    {/if}
  {/if}
</section>

<style>
  /* Single series in the accent color (one series: no legend, identity from the title). */
  .viz {
    --series-1: var(--accent);
    --chart-grid: #e1e0d9;
    --chart-axis: #c3c2b7;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .viz {
      --chart-grid: #2c2c2a;
      --chart-axis: #383835;
    }
  }
  :global(:root[data-theme='dark']) .viz {
    --chart-grid: #2c2c2a;
    --chart-axis: #383835;
  }
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 12px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }
  .tile {
    background: var(--card);
    border-radius: 10px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tile span {
    color: var(--muted);
    font-size: 0.9em;
  }
  .tile b {
    font-size: 1.5em;
    font-weight: 600;
  }
  h2 {
    margin-top: 22px;
  }
  .chart-box {
    padding: 14px 16px 8px;
  }
  .list-box {
    padding: 10px 16px;
  }
  .all-channels {
    margin-top: 8px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 0 16px;
  }
</style>
