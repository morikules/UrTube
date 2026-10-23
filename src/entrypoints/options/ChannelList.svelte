<script lang="ts">
  /**
   * All channels ever watched (and subscribed ones), with how much of each was
   * watched where the channel was counted (on its page or with ↻ here).
   */
  import { SvelteMap } from 'svelte/reactivity';
  import { channelListIds, summarizeChannel } from '@/lib/channelStats';
  import { TrackerDB, type Video } from '@/lib/db';
  import { n, t } from '@/lib/i18n';
  import { send } from '@/lib/messages';
  import { channelPlaylistsId, type PlaylistInfo } from '@/lib/playlists';
  import { SUBSCRIPTIONS_KEY, type Subscriptions } from '@/lib/subscriptions';
  import { channelUrl, formatDate, formatDateTime, videoChannelUrl } from '@/lib/youtube';
  import Dropdown from './Dropdown.svelte';
  import { prefs } from './prefs.svelte';

  let { videos }: { videos: Video[] } = $props();

  const C = t.stats.channels;
  const PAGE = 50;
  const db = new TrackerDB();

  interface Row {
    key: string;
    channelId?: string;
    name: string;
    url: string | null;
    watched: number;
    subscribed: boolean;
  }

  let subs = $state<Subscriptions | null>(null);
  let lists = $state.raw(new Map<string, PlaylistInfo>());
  let query = $state('');
  let filter = $state<'all' | 'subs'>('all');
  let limit = $state(PAGE);
  let error = $state('');
  /** Channels being counted on request, with the time the request was sent. */
  const counting = new SvelteMap<string, number>();

  const filters = [
    { id: 'all' as const, label: C.filterAll },
    { id: 'subs' as const, label: C.filterSubs },
  ];

  function loadSubs() {
    browser.storage.local.get(SUBSCRIPTIONS_KEY).then((s) => (subs = (s[SUBSCRIPTIONS_KEY] as Subscriptions) ?? null));
  }
  loadSubs();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SUBSCRIPTIONS_KEY]) loadSubs();
  });

  const watched = $derived(new Set(videos.filter((v) => v.status === 'watched').map((v) => v.id)));

  const rows = $derived.by(() => {
    const subscribed = new Map((subs?.channels ?? []).map((c) => [c.id, c]));
    const byKey = new Map<string, Row>();
    for (const v of videos) {
      if (v.status !== 'watched' || !v.channelName) continue;
      const key = v.channelId ?? `name:${v.channelName}`;
      const row = byKey.get(key);
      if (row) row.watched++;
      else {
        byKey.set(key, {
          key,
          channelId: v.channelId,
          name: v.channelName,
          url: videoChannelUrl(v),
          watched: 1,
          subscribed: v.channelId ? subscribed.has(v.channelId) : false,
        });
      }
    }
    // Subscribed channels never watched appear with 0.
    for (const c of subscribed.values()) {
      if (byKey.has(c.id)) continue;
      byKey.set(c.id, { key: c.id, channelId: c.id, name: c.name, url: channelUrl(c.handle ?? c.id), watched: 0, subscribed: true });
    }
    return [...byKey.values()].sort((a, b) => b.watched - a.watched || a.name.localeCompare(b.name));
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (filter === 'all' || r.subscribed) && (!q || r.name.toLowerCase().includes(q)));
  });
  const visible = $derived(filtered.slice(0, limit));

  $effect(() => {
    void query;
    void filter;
    limit = PAGE;
  });

  /** Reads the cached channel lists (and their playlists) of the visible channels. */
  async function loadLists(ids: string[]) {
    const main = ids.flatMap(channelListIds);
    const first = (await db.playlists.bulkGet(main)).filter((p) => p !== undefined) as PlaylistInfo[];
    const children = ids.flatMap((id) => first.find((p) => p.id === channelPlaylistsId(id))?.videoIds ?? []);
    const second = (await db.playlists.bulkGet(children)).filter((p) => p !== undefined) as PlaylistInfo[];
    lists = new Map([...first, ...second].map((p) => [p.id, p]));
  }

  $effect(() => {
    const ids = visible.flatMap((r) => (r.channelId ? [r.channelId] : []));
    loadLists(ids);
    // While channels are being counted, look for new numbers now and then.
    if (!counting.size) return;
    const timer = setInterval(() => loadLists(ids), 4000);
    return () => clearInterval(timer);
  });

  function summary(row: Row) {
    if (!row.channelId) return null;
    return summarizeChannel(row.channelId, (id) => lists.get(id), (id) => watched.has(id), {
      hideMembers: prefs.s?.hideMembersInChannelStats ?? false,
      withPrefix: false,
    });
  }

  // A count is finished once its lists are newer than the request and nothing is missing.
  $effect(() => {
    for (const [id, since] of counting) {
      const s = summarizeChannel(id, (x) => lists.get(x), () => false);
      if (!s.reading && (s.countedAt ?? 0) >= since) counting.delete(id);
    }
  });

  async function count(channelId: string) {
    error = '';
    try {
      counting.set(channelId, Date.now());
      await send({ type: 'countChannel', channelId });
    } catch (e) {
      counting.delete(channelId);
      error = String(e instanceof Error ? e.message : e);
    }
  }

  async function syncSubs() {
    error = '';
    try {
      await send({ type: 'syncSubscriptions' });
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    }
  }
</script>

<div class="toolbar">
  <input type="search" placeholder={C.search} bind:value={query} />
  <Dropdown label={C.show} options={filters} value={filter} onchange={(f) => (filter = f)} />
</div>
<p class="muted small subs">
  {#if subs?.at}{C.subsInfo(n(subs.channels.length), formatDateTime(subs.at))}{:else}{C.subsNone}{/if}
  <button class="link" onclick={syncSubs} title={C.subsRefresh}>↻</button>
  {#if subs?.error}<span class="error"> – {subs.error}</span>{/if}
</p>
{#if error}<p class="error">{error}</p>{/if}

{#if !filtered.length}
  <p class="muted">{C.empty}</p>
{:else}
  <ul>
    {#each visible as row (row.key)}
      {@const s = summary(row)}
      <li>
        <div class="head">
          {#if row.url}
            <a class="plain name" href={row.url} target="_blank" rel="noreferrer">{row.name}</a>
          {:else}
            <span class="name">{row.name}</span>
          {/if}
          {#if row.subscribed}<span class="badge">{C.subscribed}</span>{/if}
          <span class="watched">{C.watched(n(row.watched))}</span>
        </div>
        <div class="detail muted small">
          {#if row.channelId}
            {#if counting.has(row.channelId)}
              {s && !s.unknown ? `${s.text} – ` : ''}{C.counting}
            {:else if !s || s.unknown}
              {C.notCounted}
            {:else}
              {s.text}{#if s.countedAt}{` · ${C.countedAt(formatDate(s.countedAt))}`}{/if}
            {/if}
            <button
              class="link"
              title={C.count}
              disabled={counting.has(row.channelId)}
              onclick={() => count(row.channelId!)}>↻</button
            >
          {:else}
            {C.noChannelId}
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  {#if visible.length < filtered.length}
    <button class="more" onclick={() => (limit += PAGE)}>{C.more(n(filtered.length - visible.length))}</button>
  {/if}
{/if}

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  input[type='search'] {
    flex: 1 1 240px;
    font: inherit;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
  }
  .subs {
    margin: 8px 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  li:last-child {
    border-bottom: none;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .name {
    font-weight: 500;
  }
  .watched {
    margin-left: auto;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .badge {
    padding: 0 6px;
    border-radius: 4px;
    background: var(--border);
    font-size: 0.8em;
  }
  .detail {
    margin-top: 2px;
  }
  button.link {
    padding: 0 4px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button.link:hover:not(:disabled) {
    color: var(--accent);
  }
  .more {
    margin-top: 10px;
  }
</style>
