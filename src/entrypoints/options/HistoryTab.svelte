<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { TrackerDB, isImprecise, type Video } from '@/lib/db';
  import { send } from '@/lib/messages';
  import ConfirmButton from './ConfirmButton.svelte';
  import Dropdown from './Dropdown.svelte';
  import SearchInput from './SearchInput.svelte';
  import VideoRow, { type VideoAction } from './VideoRow.svelte';
  import { n, t } from '@/lib/i18n';
  import { isGone, isMusicVideo } from '@/lib/youtube';
  import {
    LENGTH_FILTERS,
    ORIGINS,
    abandonedVideos,
    download,
    inDateRange,
    lengthMatches,
    originsByVideo,
    resumePoints,
    videosCsv,
    type LengthFilter,
    type Origin,
  } from '@/lib/history';
  import { prefs } from './prefs.svelte';

  /** `dataVersion` changes whenever the background reports new data. */
  let { dataVersion, onchange }: { dataVersion: number; onchange: () => void } = $props();

  const PAGE = 100;
  const db = new TrackerDB();
  const H = t.history;

  type Filter = keyof typeof H.filters;
  /** Videos still waiting for channel details (filled in from YouTube in the background). */
  const noChannel = (v: Video) => !v.channelName && !v.channelId && !isGone(v);
  // These entries show how many there are, so progress of filling in details is visible.
  const counted: Partial<Record<Filter, (v: Video) => boolean>> = {
    nochannel: noChannel,
    gone: isGone,
    undated: (v) => undated.has(v.id),
    continue: (v) => resume.has(v.id),
    abandoned: (v) => abandoned.has(v.id),
    members: (v) => membersOnly.has(v.id),
    premiere: (v) => !!v.isPremiere,
    dismissed: (v) => isHidden(v),
  };
  const filters = $derived(
    (Object.keys(H.filters) as Filter[]).map((id) => {
      const test = counted[id];
      return { id, label: test ? `${H.filters[id]} (${n(all.filter(test).length)})` : H.filters[id] };
    }),
  );

  // raw: ~50k videos, replaced as a whole on reload
  let all = $state.raw<Video[]>([]);
  /** Where unfinished videos can be continued (seconds), from the views recorded here. */
  let resume = $state.raw(new Map<string, number>());
  /** Videos given up early, members-only videos (from counted channels), where views came from. */
  let abandoned = $state.raw(new Set<string>());
  let membersOnly = $state.raw(new Set<string>());
  /** Videos with a view whose date is not the real watch time (bulk import, day only). */
  let undated = $state.raw(new Set<string>());
  let origins = $state.raw(new Map<string, Set<Origin>>());
  /** Hidden with ⊘: videos, and channels by handle or ID. */
  let hiddenVideos = $state.raw(new Set<string>());
  let hiddenChannels = $state.raw(new Set<string>());
  const isHidden = (v: Video) =>
    hiddenVideos.has(v.id) ||
    (!!v.channelHandle && hiddenChannels.has(v.channelHandle)) ||
    (!!v.channelId && hiddenChannels.has(v.channelId));
  let loading = $state(true);
  let query = $state('');
  let filter = $state<Filter>('all');
  let length = $state<LengthFilter>('all');
  let origin = $state<Origin>('all');
  const originOptions = ORIGINS.map((id) => ({ id, label: H.origins[id] }));
  let dateFrom = $state('');
  let dateTo = $state('');
  let limit = $state(PAGE);
  let expanded = $state<string | null>(null);
  let error = $state('');
  const selected = new SvelteSet<string>();

  const lengths = LENGTH_FILTERS.map((id) => ({ id, label: H.lengths[id] }));

  async function load() {
    const [videos, views, membersLists, dismissed] = await Promise.all([
      db.videos.orderBy('lastViewAt').reverse().toArray(),
      db.views.toArray(),
      db.playlists.where('id').startsWith('UUMO').toArray(),
      db.dismissed.toArray(),
    ]);
    all = videos;
    resume = resumePoints(views, prefs.s?.finishedThreshold ?? 0.9);
    abandoned = abandonedVideos(views);
    origins = originsByVideo(views);
    undated = new Set(views.filter(isImprecise).map((v) => v.videoId));
    membersOnly = new Set(membersLists.flatMap((p) => p.videoIds));
    hiddenVideos = new Set(dismissed.filter((d) => d.kind === 'video').map((d) => d.id));
    hiddenChannels = new Set(dismissed.filter((d) => d.kind === 'channel').map((d) => d.id));
    const first = loading;
    loading = false;
    if (first) restoreScroll();
  }

  // Reloading the page (F5) comes back to where the list was scrolled to.
  const SCROLL_KEY = 'historyScroll';
  function restoreScroll() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? 'null') as { y: number; limit: number } | null;
      if (!saved) return;
      limit = Math.max(PAGE, saved.limit);
      tick().then(() => window.scrollTo(0, saved.y));
    } catch {
      // nothing saved or storage blocked: start at the top
    }
  }
  function saveScroll() {
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ y: window.scrollY, limit }));
    } catch {
      // storage blocked: not remembered
    }
  }
  $effect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(saveScroll, 200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', saveScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', saveScroll);
    };
  });

  /** Exports the selected videos (in list order). */
  function exportSelected() {
    const rows = filtered.filter((v) => selected.has(v.id));
    download(videosCsv(rows), `urtube-history-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  // The date fields show the whole history by default: oldest entry to today.
  const dayOf = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const oldestDay = $derived.by(() => {
    let min = Infinity;
    for (const v of all) if (v.firstViewAt > 0 && v.firstViewAt < min) min = v.firstViewAt;
    return Number.isFinite(min) ? dayOf(min) : dayOf(Date.now());
  });
  const today = dayOf(Date.now());
  /** Changing a field back to its default removes that limit. */
  function setFrom(value: string) {
    dateFrom = !value || value <= oldestDay ? '' : value;
  }
  function setTo(value: string) {
    dateTo = !value || value >= today ? '' : value;
  }

  const withCategory = $derived(prefs.s?.musicFromCategory ?? true);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return all.filter((v) => {
      if (filter === 'watched' && v.status !== 'watched') return false;
      if (filter === 'unwatched' && v.status !== 'unwatched') return false;
      if (filter === 'shorts' && !v.isShort) return false;
      if (filter === 'multi' && v.viewCount < 2) return false;
      if (filter === 'nochannel' && !noChannel(v)) return false;
      if (filter === 'gone' && !isGone(v)) return false;
      if (filter === 'undated' && !undated.has(v.id)) return false;
      if (filter === 'continue' && !resume.has(v.id)) return false;
      if (filter === 'abandoned' && !abandoned.has(v.id)) return false;
      if (filter === 'members' && !membersOnly.has(v.id)) return false;
      if (filter === 'premiere' && !v.isPremiere) return false;
      if (filter === 'dismissed' && !isHidden(v)) return false;
      if (origin !== 'all' && !origins.get(v.id)?.has(origin)) return false;
      if (!lengthMatches(v, length) || !inDateRange(v, dateFrom, dateTo)) return false;
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

  /** All videos matching the filters are selected (not only the ones loaded so far). */
  const allSelected = $derived(filtered.length > 0 && filtered.every((v) => selected.has(v.id)));
  const someSelected = $derived(!allSelected && filtered.some((v) => selected.has(v.id)));
  function toggleAll() {
    if (allSelected) for (const v of filtered) selected.delete(v.id);
    else for (const v of filtered) selected.add(v.id);
  }

  // Reset paging when the search or filter changes.
  $effect(() => {
    void query;
    void filter;
    void length;
    void origin;
    void dateFrom;
    void dateTo;
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

  async function act(action: VideoAction, ids: string[]) {
    if (!ids.length) return;
    error = '';
    try {
      if (action === 'deleteVideos') await send({ type: 'deleteVideos', ids });
      else if (action === 'markUnwatched') await send({ type: 'markUnwatched', ids });
      else if (action === 'markFinished') await send({ type: 'markFinished', ids });
      else if (action === 'notMusic' || action === 'isMusic') {
        await send({ type: 'setNotMusic', ids, notMusic: action === 'notMusic' });
      } else await send({ type: 'markWatched', ids });
      for (const id of ids) selected.delete(id);
      // These change the views (continue watching) or the music flag: read everything again.
      if (action === 'markFinished' || action === 'notMusic' || action === 'isMusic') await load();
      else await refreshVideos(ids);
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
    <SearchInput placeholder={H.search} bind:value={query} />
    <Dropdown label={H.show} options={filters} value={filter} onchange={(f) => (filter = f)} resettable />
    <Dropdown label={H.length} options={lengths} value={length} onchange={(l) => (length = l)} resettable />
    <Dropdown label={H.origin} options={originOptions} value={origin} onchange={(o) => (origin = o)} resettable />
  </div>
  <div class="toolbar second">
    <label class="all" title={H.selectAllHint}>
      <input
        type="checkbox"
        checked={allSelected}
        indeterminate={someSelected}
        disabled={!filtered.length}
        onchange={toggleAll}
      />
      {selected.size ? H.selected(n(selected.size)) : H.selectAll(n(filtered.length))}
    </label>
    <!-- While videos are selected, their actions take the place of the dates: the list does not move. -->
    {#if selected.size}
      <div class="actions">
        <button onclick={() => act('markUnwatched', [...selected])}>{H.markUnwatched}</button>
        <button onclick={() => act('markWatched', [...selected])}>{H.markWatched}</button>
        <button onclick={() => act('markFinished', [...selected])} title={t.video.finishedHint}>{t.video.markFinished}</button>
        <button onclick={() => act('notMusic', [...selected])} title={t.video.notMusicHint}>{t.video.notMusic}</button>
        <button onclick={exportSelected} title={H.exportHint}>{H.exportCsv}</button>
        <ConfirmButton
          label={t.common.delete}
          question={H.deleteQuestion(n(selected.size))}
          confirmLabel={t.common.delete}
          danger
          onconfirm={() => act('deleteVideos', [...selected])}
        />
        <button onclick={() => selected.clear()}>{H.clearSelection}</button>
      </div>
    {:else}
      <label class="date">
        {H.from}
        <input
          type="date"
          value={dateFrom || oldestDay}
          min={oldestDay}
          max={dateTo || today}
          onchange={(e) => setFrom(e.currentTarget.value)}
        />
      </label>
      <label class="date">
        {H.to}
        <input
          type="date"
          value={dateTo || today}
          min={dateFrom || oldestDay}
          max={today}
          onchange={(e) => setTo(e.currentTarget.value)}
        />
      </label>
      {#if dateFrom || dateTo}
        <button class="reset" title={t.common.resetFilter} onclick={() => ((dateFrom = ''), (dateTo = ''))}>✕</button>
      {/if}
    {/if}
  </div>

  <!-- The total is in the header; only show a count when it differs. -->
  {#if loading}
    <p class="status muted">{t.common.loading}</p>
  {:else if !all.length}
    <p class="status muted">{H.empty}</p>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <ul>
    {#each visible as video (video.id)}
      <VideoRow
        {video}
        resumeAt={resume.get(video.id)}
        tags={{
          abandoned: abandoned.has(video.id),
          membersOnly: membersOnly.has(video.id),
          hidden: isHidden(video),
        }}
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
  .toolbar {
    margin-bottom: 10px;
  }
  /* Stays at the top while scrolling, so the actions for selected videos are always at hand. */
  .toolbar.second {
    position: sticky;
    top: 0;
    z-index: 5;
    min-height: 34px;
    padding: 4px 0;
    background: var(--bg);
    font-size: 0.9em;
  }
  .date {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
  .date input {
    font: inherit;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    color-scheme: light dark;
  }
  /* Lines up with the checkboxes of the rows below. */
  .all {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
    padding-left: 4px;
    color: var(--muted);
    cursor: pointer;
  }
  .status {
    margin: 0 0 6px;
    font-size: 0.9em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .reset {
    padding: 2px 8px;
    color: var(--muted);
  }
  .reset:hover {
    color: var(--accent);
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
