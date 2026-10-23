<script lang="ts">
  import { TrackerDB, type Video, type View } from '@/lib/db';
  import { n as fmt, t } from '@/lib/i18n';
  import { RANGE_IDS, computeHighlights, computeStats, formatWatchTime, rangeFor, type RangeId } from '@/lib/stats';
  import { formatDate, videoUrl } from '@/lib/youtube';
  import YearReview from './YearReview.svelte';
  import BarList from './BarList.svelte';
  import ChannelList from './ChannelList.svelte';
  import ColumnChart from './ColumnChart.svelte';
  import Dropdown from './Dropdown.svelte';

  /** `dataVersion` changes whenever the background reports new data. */
  let { dataVersion }: { dataVersion: number } = $props();

  const T = t.stats;
  const ranges = RANGE_IDS.map((id) => ({ id, label: T.ranges[id] }));
  let rangeId = $state<RangeId>('30d');

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

  const range = $derived(rangeFor(rangeId));
  const stats = $derived(computeStats(videos, views, range));
  const highlights = $derived(computeHighlights(videos, views, range, stats.buckets, stats.granularity));
  /** YouTube's category names are English; translated where known. */
  const categoryName = (c: string) => (T.categoryNames as Record<string, string>)[c] ?? c;
  /** "2026-10-03" → date in the current language */
  const dayLabel = (day: string) => formatDate(Date.parse(`${day}T12:00:00`));

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

    <div class="tiles streaks">
      <div class="tile">
        <span>{T.longestStreak}</span><b>{T.daysCount(fmt(highlights.longestStreak.days))}</b>
        {#if highlights.longestStreak.from && highlights.longestStreak.days > 1}
          <small class="muted">{dayLabel(highlights.longestStreak.from)} – {dayLabel(highlights.longestStreak.to!)}</small>
        {/if}
      </div>
      <div class="tile"><span>{T.currentStreak}</span><b>{T.daysCount(fmt(highlights.currentStreak))}</b></div>
      <div class="tile">
        <span>{T.busiestDay}</span><b>{highlights.busiestDay ? t.common.videos(fmt(highlights.busiestDay.videos)) : '–'}</b>
        {#if highlights.busiestDay}<small class="muted">{dayLabel(highlights.busiestDay.day)}</small>{/if}
      </div>
      <div class="tile"><span>{T.newChannels}</span><b>{fmt(highlights.newChannelsTotal)}</b></div>
    </div>

    <div class="cols">
      <div>
        <h2>{T.rewatchedTitle}</h2>
        <div class="box list-box">
          {#if highlights.rewatched.length}
            <ol class="rewatched">
              {#each highlights.rewatched as r, i (r.id)}
                <li>
                  <span class="rank muted">{i + 1}.</span>
                  <span class="what">
                    <a class="plain" href={videoUrl(r.id)} target="_blank" rel="noreferrer">{r.title}</a>
                    {#if r.channelName}<span class="muted small"> · {r.channelName}</span>{/if}
                  </span>
                  <span class="count">{T.viewsCount(fmt(r.count))}</span>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="muted">{T.noRewatched}</p>
          {/if}
        </div>
      </div>
      <div>
        <h2>{T.categoriesTitle}</h2>
        <div class="box list-box">
          {#if highlights.categories.length}
            <BarList
              rows={highlights.categories.map((c) => ({ ...c, label: categoryName(c.label) }))}
              unit={(c) => t.common.videos(fmt(c))}
            />
          {:else}
            <p class="muted">{T.noCategories}</p>
          {/if}
          {#if highlights.unknownCategory}
            <p class="muted small">{T.unknownCategory(fmt(highlights.unknownCategory))}</p>
          {/if}
        </div>
      </div>
    </div>

    <h2>{T.newChannelsTitle(T.per[stats.granularity])}</h2>
    {#if highlights.newChannelsTotal}
      <div class="box chart-box">
        <ColumnChart
          data={highlights.newChannels.map((b) => ({
            label: stats.granularity === 'week' ? T.weekFrom(b.label) : b.label,
            value: b.channels,
          }))}
          unit={(v) => T.channelsCount(fmt(v))}
        />
      </div>
    {:else}
      <p class="muted">{T.noNewChannels}</p>
    {/if}

    <h2>{T.year.title}</h2>
    <p class="muted">{T.year.intro}</p>
    <YearReview {videos} {views} />

    <h2>{T.channels.title}</h2>
    <p class="muted">{T.channels.intro}</p>
    <div class="box list-box">
      <ChannelList {videos} />
    </div>
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
  .streaks {
    margin-top: 22px;
  }
  .tile small {
    font-size: 0.85em;
  }
  /* Rank, title (may wrap), count on the right – each in its own column. */
  .rewatched {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rewatched li {
    display: grid;
    grid-template-columns: 1.6em 1fr auto;
    gap: 8px;
    align-items: baseline;
    padding: 4px 0;
  }
  .rewatched .count {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 0 16px;
  }
</style>
