<script lang="ts">
  import { TrackerDB, type Video, type View, type ViewSource } from '@/lib/db';
  import { send } from '@/lib/messages';
  import { t } from '@/lib/i18n';
  import ConfirmButton from './ConfirmButton.svelte';
  import { formatDate, formatDateTime, formatDuration, thumbnailUrl, videoUrl } from '@/lib/youtube';

  interface Props {
    video: Video;
    selected: boolean;
    expanded: boolean;
    ontoggleselect: () => void;
    ontoggleexpand: () => void;
    onaction: (action: 'markUnwatched' | 'markWatched' | 'deleteVideos') => void;
    onviewdeleted: () => void;
    onerror: (message: string) => void;
  }
  let {
    video,
    selected,
    expanded,
    ontoggleselect,
    ontoggleexpand,
    onaction,
    onviewdeleted,
    onerror,
  }: Props = $props();

  const V = t.video;
  const sourceLabels: Record<ViewSource, string> = V.sources;

  let views = $state<View[] | null>(null);

  async function loadViews() {
    const rows = await new TrackerDB().views.where('videoId').equals(video.id).sortBy('at');
    views = rows.reverse();
  }

  $effect(() => {
    // Also reload when the video changes (e.g. new view recorded).
    void video.viewCount;
    if (expanded) loadViews();
  });

  async function removeView(view: View) {
    try {
      await send({ type: 'deleteView', viewId: view.id! });
      await loadViews();
      onviewdeleted();
    } catch (e) {
      onerror(V.viewDeleteFailed(String(e)));
    }
  }

  /** YouTube's publish date in the current language; as delivered if it cannot be read. */
  function publishedLabel(value: string): string {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value.slice(0, 10) : formatDate(ms);
  }

  function progress(v: View): string {
    if (v.maxPosition === undefined) return '';
    const dur = v.durationSec ?? video.durationSec;
    if (!dur) return V.progressTo(formatDuration(v.maxPosition));
    const pct = Math.min(100, Math.round((v.maxPosition / dur) * 100));
    return V.progressOf(formatDuration(v.maxPosition), formatDuration(dur), String(pct));
  }
</script>

<li class:selected class:reset={video.status === 'unwatched'}>
  <div class="row">
    <input type="checkbox" checked={selected} onchange={ontoggleselect} aria-label={V.select} />

    <a class="thumb" href={videoUrl(video.id, video.isShort)} target="_blank" rel="noreferrer">
      <img src={thumbnailUrl(video.id)} alt="" loading="lazy" width="128" height="72" />
      {#if video.durationSec}<span class="duration">{formatDuration(video.durationSec)}</span>{/if}
    </a>

    <button class="info" onclick={ontoggleexpand} aria-expanded={expanded}>
      <span class="title">{video.title || video.id}</span>
      <span class="meta">
        {#if video.channelName}<span>{video.channelName}</span>{/if}
        <span>{V.views(String(video.viewCount))}</span>
        <span>
          {#if video.viewCount > 1}{formatDate(video.firstViewAt)} – {/if}{formatDate(video.lastViewAt)}
        </span>
        {#if video.publishedAt}<span>{V.published(publishedLabel(video.publishedAt))}</span>{/if}
      </span>
      <span class="badges">
        {#if video.status === 'unwatched'}<span class="badge reset">{V.badgeReset}</span>{/if}
        {#if video.isShort}<span class="badge">{V.badgeShort}</span>{/if}
        {#if video.isLive}<span class="badge" title={V.badgeLiveHint}>{V.badgeLive}</span>{/if}
        {#if video.isMusic}<span class="badge">{V.badgeMusic}</span>{/if}
      </span>
    </button>

    <div class="actions">
      {#if video.status === 'watched'}
        <button onclick={() => onaction('markUnwatched')} title={V.unwatchedTitle}>{V.unwatched}</button>
      {:else}
        <button onclick={() => onaction('markWatched')} title={V.watchedTitle}>{V.watched}</button>
      {/if}
      <ConfirmButton
        label={t.common.delete}
        question={V.deleteQuestion}
        confirmLabel={t.common.delete}
        danger
        onconfirm={() => onaction('deleteVideos')}
      />
    </div>
  </div>

  {#if expanded}
    <div class="views">
      {#if !views}
        <span class="muted">{t.common.loading}</span>
      {:else}
        <table>
          <tbody>
            {#each views as v (v.id)}
              <tr>
                <td class="when">
                  {#if v.dayOnly}{formatDate(v.at)} <span class="muted">{V.dayOnly}</span>{:else}{formatDateTime(v.at)}{/if}
                </td>
                <td>
                  {#if v.kind === 'watch'}
                    {#if v.finishedAt}<b>{V.finished}</b>{:else}{V.viewed}{/if}
                    {#if v.source === 'youtube-music'}<span class="muted"> · YouTube Music</span>{/if}
                    {#if v.entry}<span class="muted"> · {V.via(t.entries[v.entry])}</span>{/if}
                    {#if v.playlistId}<span class="muted"> · {V.playlist}{v.playlistIndex ? ` #${v.playlistIndex}` : ''}</span>{/if}
                  {:else}
                    <span class="muted">{sourceLabels[v.source]}</span>
                    {#if v.reportedPercent !== undefined}<span class="muted"> · {v.reportedPercent} %</span>{/if}
                  {/if}
                </td>
                <td class="muted">
                  {progress(v)}
                  {#if v.watchedSeconds}· {V.watchedTime(formatDuration(v.watchedSeconds))}{/if}
                </td>
                <td>
                  <ConfirmButton
                    label={V.removeView}
                    question={V.removeViewQuestion}
                    confirmLabel={t.common.delete}
                    danger
                    small
                    onconfirm={() => removeView(v)}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="muted small">
          {V.videoId} {video.id}
          {#if video.channelHandle} · {video.channelHandle}{/if}
          {#if video.category} · {video.category}{/if}
        </div>
      {/if}
    </div>
  {/if}
</li>

<style>
  li {
    border-bottom: 1px solid var(--border);
  }
  li.selected {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .row {
    display: grid;
    grid-template-columns: auto 128px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 8px 4px;
  }
  .thumb {
    position: relative;
    display: block;
    width: 128px;
    height: 72px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--card);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  li.reset .thumb img {
    opacity: 0.5;
  }
  .duration {
    position: absolute;
    right: 4px;
    bottom: 4px;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    font-size: 11px;
    padding: 0 4px;
    border-radius: 3px;
  }
  .info {
    all: unset;
    cursor: pointer;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--muted);
    font-size: 0.9em;
    display: flex;
    flex-wrap: wrap;
    gap: 0 12px;
  }
  .badges {
    display: flex;
    gap: 4px;
  }
  .badge {
    font-size: 0.75em;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--muted);
    margin-left: 4px;
  }
  .badge.reset {
    color: var(--accent);
    border-color: var(--accent);
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .actions button {
    font-size: 0.85em;
  }
  .views {
    padding: 4px 8px 12px 160px;
    font-size: 0.9em;
  }
  .views td {
    padding: 3px 12px 3px 0;
    vertical-align: top;
  }
  .when {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 0.85em;
    margin-top: 6px;
  }
  @media (max-width: 640px) {
    .row {
      grid-template-columns: auto 96px 1fr;
    }
    .thumb {
      width: 96px;
      height: 54px;
    }
    .actions {
      grid-column: 2 / -1;
    }
    .views {
      padding-left: 8px;
    }
  }
</style>
