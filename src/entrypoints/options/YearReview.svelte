<script lang="ts">
  /** A year at a glance: the highlights of one calendar year on one card grid. */
  import type { Video, View } from '@/lib/db';
  import { n, t } from '@/lib/i18n';
  import { computeHighlights, computeStats, formatWatchTime, yearRange, yearsWithViews } from '@/lib/stats';
  import { formatDate, videoUrl } from '@/lib/youtube';
  import Dropdown from './Dropdown.svelte';

  let { videos, views }: { videos: Video[]; views: View[] } = $props();

  const T = t.stats;
  const Y = T.year;

  const years = $derived(yearsWithViews(views));
  let chosen = $state<number | null>(null);
  const year = $derived(chosen ?? years[0] ?? new Date().getFullYear());

  const range = $derived(yearRange(year));
  const stats = $derived(computeStats(videos, views, range, 5));
  const h = $derived(computeHighlights(videos, views, range, stats.buckets, stats.granularity, 5));
  const busiestMonth = $derived(stats.buckets.reduce((a, b) => (b.videos > (a?.videos ?? 0) ? b : a), stats.buckets[0]));
  const categoryName = (c: string) => (T.categoryNames as Record<string, string>)[c] ?? c;
  const dayLabel = (day: string) => formatDate(Date.parse(`${day}T12:00:00`));
</script>

{#if !years.length}
  <p class="muted">{Y.empty}</p>
{:else}
  <div class="toolbar">
    <Dropdown
      label={Y.label}
      options={years.map((y) => ({ id: String(y), label: String(y) }))}
      value={String(year)}
      onchange={(y) => (chosen = Number(y))}
    />
  </div>
  <div class="grid">
    <div class="card big">
      <span>{Y.videos}</span>
      <b>{n(stats.videos)}</b>
      <small class="muted">{Y.timeAndViews(formatWatchTime(stats.watchedSeconds), n(stats.views))}</small>
    </div>
    <div class="card">
      <span>{Y.topChannels}</span>
      {#if stats.topChannels.length}
        <ol>
          {#each stats.topChannels as c (c.label)}
            <li>
              {#if c.url}<a class="plain" href={c.url} target="_blank" rel="noreferrer">{c.label}</a>{:else}{c.label}{/if}
              <span class="muted">{n(c.count)}</span>
            </li>
          {/each}
        </ol>
      {:else}<b>–</b>{/if}
    </div>
    <div class="card">
      <span>{Y.topCategories}</span>
      {#if h.categories.length}
        <ol>
          {#each h.categories as c (c.label)}
            <li>{categoryName(c.label)} <span class="muted">{n(c.count)}</span></li>
          {/each}
        </ol>
      {:else}<b>–</b>{/if}
    </div>
    <div class="card">
      <span>{Y.mostRewatched}</span>
      {#if h.rewatched[0]}
        <a class="plain title" href={videoUrl(h.rewatched[0].id)} target="_blank" rel="noreferrer">{h.rewatched[0].title}</a>
        <small class="muted">{T.viewsCount(n(h.rewatched[0].count))}</small>
      {:else}<b>–</b>{/if}
    </div>
    <div class="card">
      <span>{T.longestStreak}</span>
      <b>{T.daysCount(n(h.longestStreak.days))}</b>
      {#if h.longestStreak.from && h.longestStreak.days > 1}
        <small class="muted">{dayLabel(h.longestStreak.from)} – {dayLabel(h.longestStreak.to!)}</small>
      {/if}
    </div>
    <div class="card">
      <span>{T.busiestDay}</span>
      <b>{h.busiestDay ? dayLabel(h.busiestDay.day) : '–'}</b>
      {#if h.busiestDay}<small class="muted">{t.common.videos(n(h.busiestDay.videos))}</small>{/if}
    </div>
    <div class="card">
      <span>{Y.busiestMonth}</span>
      <b>{busiestMonth?.videos ? busiestMonth.label : '–'}</b>
      {#if busiestMonth?.videos}<small class="muted">{t.common.videos(n(busiestMonth.videos))}</small>{/if}
    </div>
    <div class="card">
      <span>{T.newChannels}</span>
      <b>{n(h.newChannelsTotal)}</b>
    </div>
    <div class="card">
      <span>{Y.first}</span>
      {#if h.first}
        <a class="plain title" href={videoUrl(h.first.id)} target="_blank" rel="noreferrer">{h.first.title}</a>
        <small class="muted">{formatDate(h.first.at)}</small>
      {:else}<b>–</b>{/if}
    </div>
    {#if h.last && h.last.id !== h.first?.id}
      <div class="card">
        <span>{Y.last}</span>
        <a class="plain title" href={videoUrl(h.last.id)} target="_blank" rel="noreferrer">{h.last.title}</a>
        <small class="muted">{formatDate(h.last.at)}</small>
      </div>
    {/if}
    {#if h.channelTime[0]}
      <div class="card">
        <span>{Y.longestChannel}</span>
        <b>{h.channelTime[0].label}</b>
        <small class="muted">{formatWatchTime(h.channelTime[0].count)}</small>
      </div>
    {/if}
  </div>
{/if}

<style>
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--card);
    min-width: 0;
  }
  .card > span {
    color: var(--muted);
    font-size: 0.9em;
  }
  .card b {
    font-size: 1.2em;
    font-weight: 600;
  }
  /* The total in the accent color: the headline of the year. */
  .card.big b {
    font-size: 2em;
    color: var(--accent);
  }
  .title {
    font-weight: 500;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  ol {
    margin: 0;
    padding-left: 1.2em;
  }
  ol li .muted {
    float: right;
    margin-left: 8px;
  }
  small {
    font-size: 0.85em;
  }
</style>
