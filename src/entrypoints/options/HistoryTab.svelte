<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { TrackerDB, type Video } from '@/lib/db';
  import { send } from '@/lib/messages';
  import ConfirmButton from './ConfirmButton.svelte';
  import Dropdown from './Dropdown.svelte';
  import VideoRow from './VideoRow.svelte';
  import { n, t } from '@/lib/i18n';
  import { isMusicVideo } from '@/lib/youtube';
  import { prefs } from './prefs.svelte';

  /** `dataVersion` changes whenever the background reports new data. */
  let { dataVersion, onchange }: { dataVersion: number; onchange: () => void } = $props();

  const PAGE = 100;
  const db = new TrackerDB();
  const H = t.history;

  type Filter = keyof typeof H.filters;
  /** Videos without channel details yet (filled in from YouTube in the background). */
  const noChannel = (v: Video) => !v.channelName && !v.channelId;
  // The "without channel" entry shows how many are left, so progress is visible.
  const filters = $derived(
    (Object.keys(H.filters) as Filter[]).map((id) => ({
      id,
      label: id === 'nochannel' ? `${H.filters[id]} (${n(all.filter(noChannel).length)})` : H.filters[id],
    })),
  );

  // raw: ~50k videos, replaced as a whole on reload
  let all = $state.raw<Video[]>([]);
  let loading = $state(true);
  let query = $state('');
  let filter = $state<Filter>('all');
  let limit = $state(PAGE);
  let expanded = $state<string | null>(null);
  let error = $state('');
  const selected = new SvelteSet<string>();

  async function load() {
    all = await db.videos.orderBy('lastViewAt').reverse().toArray();
    loading = false;
  }

  const withCategory = $derived(prefs.s?.musicFromCategory ?? true);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return all.filter((v) => {
      if (filter === 'watched' && v.status !== 'watched') return false;
      if (filter === 'unwatched' && v.status !== 'unwatched') return false;
      if (filter === 'shorts' && !v.isShort) return false;
      if (filter === 'nochannel' && !noChannel(v)) return false;
      if (filter === 'music' || filter === 'nomusic') {
        if (isMusicVideo(v, withCategory) !== (filter === 'music')) return false;
      }
      if (!q) return true;
      return (
        v.id.toLowerCase() === q ||
        v.title.toLowerCase().includes(q) ||
        (v.channelName?.toLowerCase().includes(q) ?? false)
      );
    });
  });
  const visible = $derived(filtered.slice(0, limit));

  // Reset paging when the search or filter changes.
  $effect(() => {
    void query;
    void filter;
    limit = PAGE;
  });

  /** Svelte action: load the next page when the sentinel scrolls into view. */
  function loadMoreWhenVisible(node: HTMLElement) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) limit += PAGE;
    }, { rootMargin: '600px' });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  // Reload when the background reports changes (first run is the initial load).
  $effect(() => {
    void dataVersion;
    load().catch((e) => (error = String(e)));
  });

  async function act(action: 'markUnwatched' | 'markWatched' | 'deleteVideos', ids: string[]) {
    if (!ids.length) return;
    error = '';
    try {
      if (action === 'deleteVideos') await send({ type: 'deleteVideos', ids });
      else if (action === 'markUnwatched') await send({ type: 'markUnwatched', ids });
      else await send({ type: 'markWatched', ids });
      for (const id of ids) selected.delete(id);
      await refreshVideos(ids);
    } catch (e) {
      error = H.actionFailed(String(e));
    }
  }

  /** Re-reads changed videos and patches the list in place (keeps scroll position). */
  async function refreshVideos(ids: string[]) {
    const fresh = await db.videos.bulkGet(ids);
    const byId = new Map(ids.map((id, i) => [id, fresh[i]]));
    all = all.flatMap((v) => {
      if (!byId.has(v.id)) return [v];
      const f = byId.get(v.id);
      return f ? [f] : [];
    });
    onchange();
  }

  function toggleSelect(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
</script>

<section>
  <div class="toolbar">
    <input type="search" placeholder={H.search} bind:value={query} />
    <Dropdown label={H.show} options={filters} value={filter} onchange={(f) => (filter = f)} />
  </div>

  <!-- The total is in the header; only show a count when it differs. -->
  {#if loading}
    <p class="status muted">{t.common.loading}</p>
  {:else if !all.length}
    <p class="status muted">{H.empty}</p>
  {:else if query.trim() || filter !== 'all'}
    <p class="status muted">{H.hits(n(filtered.length))}</p>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if selected.size}
    <div class="selection">
      <b>{H.selected(n(selected.size))}</b>
      <button onclick={() => act('markUnwatched', [...selected])}>{H.markUnwatched}</button>
      <button onclick={() => act('markWatched', [...selected])}>{H.markWatched}</button>
      <ConfirmButton
        label={t.common.delete}
        question={H.deleteQuestion(n(selected.size))}
        confirmLabel={t.common.delete}
        danger
        onconfirm={() => act('deleteVideos', [...selected])}
      />
      <button onclick={() => selected.clear()}>{H.clearSelection}</button>
    </div>
  {/if}

  <ul>
    {#each visible as video (video.id)}
      <VideoRow
        {video}
        selected={selected.has(video.id)}
        expanded={expanded === video.id}
        ontoggleselect={() => toggleSelect(video.id)}
        ontoggleexpand={() => (expanded = expanded === video.id ? null : video.id)}
        onaction={(action) => act(action, [video.id])}
        onviewdeleted={() => refreshVideos([video.id])}
        onerror={(msg) => (error = msg)}
      />
    {/each}
  </ul>

  {#if visible.length < filtered.length}
    <div class="sentinel muted" use:loadMoreWhenVisible>{H.loadMore}</div>
  {/if}
</section>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  input[type='search'] {
    flex: 1 1 280px;
    font: inherit;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
  }
  .toolbar {
    margin-bottom: 10px;
  }
  .status {
    margin: 0 0 6px;
    font-size: 0.9em;
  }
  .selection {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    margin-bottom: 8px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .sentinel {
    padding: 16px;
    text-align: center;
  }
</style>
