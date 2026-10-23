<script lang="ts">
  /**
   * All channels ever watched (and subscribed ones), with how much of each was
   * watched where the channel was counted (on its page or with ↻ here).
   */
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { channelListIds, summarizeChannel } from '@/lib/channelStats';
  import { TrackerDB, type Video } from '@/lib/db';
  import { n, t } from '@/lib/i18n';
  import { send } from '@/lib/messages';
  import { channelPlaylistsId, type PlaylistInfo } from '@/lib/playlists';
  import { CHANNEL_AVATARS_KEY, SUBSCRIPTIONS_KEY, type Subscriptions } from '@/lib/subscriptions';
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
  let avatars = $state<Record<string, string>>({});
  let lists = $state.raw(new Map<string, PlaylistInfo>());
  let query = $state('');
  let filter = $state<'all' | 'subs'>('all');
  type Sort = 'watched' | 'share' | 'total' | 'name';
  let sort = $state<Sort>('watched');
  const sorts: { id: Sort; label: string }[] = [
    { id: 'watched', label: C.sortWatched },
    { id: 'share', label: C.sortShare },
    { id: 'total', label: C.sortTotal },
    { id: 'name', label: C.sortName },
  ];
  let limit = $state(PAGE);
  let error = $state('');
  /** Channels being counted on request, with the time the request was sent. */
  const counting = new SvelteMap<string, number>();
  /** Pictures that did not load (outdated URL): the initial is shown instead. */
  const brokenAvatars = new SvelteSet<string>();

  const filters = [
    { id: 'all' as const, label: C.filterAll },
    { id: 'subs' as const, label: C.filterSubs },
  ];

  function loadSubs() {
    browser.storage.local.get([SUBSCRIPTIONS_KEY, CHANNEL_AVATARS_KEY]).then((s) => {
      subs = (s[SUBSCRIPTIONS_KEY] as Subscriptions) ?? null;
      avatars = (s[CHANNEL_AVATARS_KEY] as Record<string, string>) ?? {};
    });
  }
  loadSubs();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[SUBSCRIPTIONS_KEY] || changes[CHANNEL_AVATARS_KEY])) loadSubs();
  });

  /** Channel picture: from the subscriptions or a visit to the channel page. */
  const avatarOf = (row: Row) =>
    row.channelId ? (avatars[row.channelId] ?? subs?.channels.find((c) => c.id === row.channelId)?.avatar) : undefined;

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
    return [...byKey.values()];
  });

  const summaries = $derived(
    new Map(rows.filter((r) => r.channelId).map((r) => [r.key, summary(r)!])),
  );

  /** Share of the channel's uploads watched; channels not counted yet come last. */
  const share = (r: Row) => {
    const s = summaries.get(r.key);
    return s && s.total ? s.seen / s.total : -1;
  };

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => (filter === 'all' || r.subscribed) && (!q || r.name.toLowerCase().includes(q)));
    const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
    const order: Record<Sort, (a: Row, b: Row) => number> = {
      watched: (a, b) => b.watched - a.watched || byName(a, b),
      share: (a, b) => share(b) - share(a) || b.watched - a.watched,
      total: (a, b) => (summaries.get(b.key)?.total ?? -1) - (summaries.get(a.key)?.total ?? -1) || byName(a, b),
      name: byName,
    };
    return list.sort(order[sort]);
  });
  const visible = $derived(filtered.slice(0, limit));

  $effect(() => {
    void query;
    void filter;
    void sort;
    limit = PAGE;
  });

  /**
   * Reads the cached channel lists: the upload lists of all channels (for
   * sorting), the playlists only of the visible ones (for their progress).
   */
  async function loadLists(allIds: string[], visibleIds: string[]) {
    const first = (await db.playlists.bulkGet(allIds.flatMap(channelListIds))).filter(
      (p) => p !== undefined,
    ) as PlaylistInfo[];
    const byId = new Map(first.map((p) => [p.id, p]));
    const children = visibleIds.flatMap((id) => byId.get(channelPlaylistsId(id))?.videoIds ?? []);
    const second = (await db.playlists.bulkGet(children)).filter((p) => p !== undefined) as PlaylistInfo[];
    lists = new Map([...first, ...second].map((p) => [p.id, p]));
  }

  // As strings: loading new lists re-sorts the rows, which must not load again unless the set changed.
  const allKey = $derived(rows.flatMap((r) => (r.channelId ? [r.channelId] : [])).join(','));
  const shownKey = $derived(
    visible
      .flatMap((r) => (r.channelId ? [r.channelId] : []))
      .sort()
      .join(','),
  );
  $effect(() => {
    const ids = allKey ? allKey.split(',') : [];
    const shown = shownKey ? shownKey.split(',') : [];
    loadLists(ids, shown);
    // While channels are being counted, look for new numbers now and then.
    if (!counting.size) return;
    const timer = setInterval(() => loadLists(ids, shown), 4000);
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
  <Dropdown label={C.sort} options={sorts} value={sort} onchange={(s) => (sort = s)} />
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
      {@const s = summaries.get(row.key) ?? null}
      {@const avatar = avatarOf(row)}
      <li>
        {#if avatar && !brokenAvatars.has(row.key)}
          <img
            class="avatar"
            src={avatar}
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            onerror={() => brokenAvatars.add(row.key)}
          />
        {:else}
          <span class="avatar initial" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span>
        {/if}
        <div class="body">
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
              {s.text}{#if s.total}{` · ${C.share(Math.round((s.seen / s.total) * 100))}`}{/if}{#if s.countedAt}{` · ${C.countedAt(formatDate(s.countedAt))}`}{/if}
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
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .avatar {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }
  .initial {
    display: grid;
    place-items: center;
    background: var(--border);
    color: var(--muted);
    font-weight: 600;
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
