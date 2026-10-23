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
  import { formatWatchTime } from '@/lib/stats';
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
    /** Total length of the watched videos (seconds). */
    seconds: number;
    subscribed: boolean;
  }

  let subs = $state<Subscriptions | null>(null);
  let avatars = $state<Record<string, string>>({});
  let lists = $state.raw(new Map<string, PlaylistInfo>());
  let query = $state('');
  let filter = $state<'all' | 'subs'>('all');
  /** Sorted by a column header; a second click turns the order around. */
  type SortKey = 'name' | 'watched' | 'time' | 'uploads' | 'share' | 'playlists' | 'counted';
  let sortKey = $state<SortKey>('watched');
  let sortDesc = $state(true);
  function sortBy(key: SortKey) {
    if (sortKey === key) sortDesc = !sortDesc;
    else {
      sortKey = key;
      sortDesc = key !== 'name'; // names A–Z, numbers largest first
    }
  }
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
      if (row) {
        row.watched++;
        row.seconds += v.durationSec ?? 0;
      } else {
        byKey.set(key, {
          key,
          channelId: v.channelId,
          name: v.channelName,
          url: videoChannelUrl(v),
          watched: 1,
          seconds: v.durationSec ?? 0,
          subscribed: v.channelId ? subscribed.has(v.channelId) : false,
        });
      }
    }
    // Subscribed channels never watched appear with 0.
    for (const c of subscribed.values()) {
      if (byKey.has(c.id)) continue;
      byKey.set(c.id, {
        key: c.id,
        channelId: c.id,
        name: c.name,
        url: channelUrl(c.handle ?? c.id),
        watched: 0,
        seconds: 0,
        subscribed: true,
      });
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
    // Values per column; channels not counted yet (-1) end up last when sorting by numbers.
    const s = (r: Row) => summaries.get(r.key);
    const value: Record<Exclude<SortKey, 'name'>, (r: Row) => number> = {
      watched: (r) => r.watched,
      time: (r) => r.seconds,
      uploads: (r) => (s(r)?.unknown ? -1 : (s(r)?.total ?? -1)),
      share,
      playlists: (r) => (s(r)?.unknown ? -1 : (s(r)?.playlistsTotal ?? -1)),
      counted: (r) => s(r)?.countedAt ?? -1,
    };
    const dir = sortDesc ? -1 : 1;
    const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
    return list.sort((a, b) => {
      if (sortKey === 'name') return dir * byName(a, b);
      const va = value[sortKey](a);
      const vb = value[sortKey](b);
      if (va === -1 || vb === -1) return (va === -1 ? 1 : 0) - (vb === -1 ? 1 : 0) || byName(a, b);
      return dir * (va - vb) || byName(a, b);
    });
  });
  const visible = $derived(filtered.slice(0, limit));

  $effect(() => {
    void query;
    void filter;
    void sortKey;
    void sortDesc;
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
  {#snippet header(key: SortKey, label: string, cls = '', hint = '')}
    <th class={cls} aria-sort={sortKey === key ? (sortDesc ? 'descending' : 'ascending') : 'none'}>
      <button class="sort" class:active={sortKey === key} onclick={() => sortBy(key)} title={hint || undefined}>
        {label}<span class="arrow">{sortKey === key ? (sortDesc ? '▼' : '▲') : ''}</span>
      </button>
    </th>
  {/snippet}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          {@render header('name', C.colChannel)}
          {@render header('watched', C.colWatched, 'num', C.colWatchedHint)}
          {@render header('time', C.colTime, 'num', C.colTimeHint)}
          {@render header('uploads', C.colUploads, 'num', C.colUploadsHint)}
          {@render header('share', C.colShare, 'num')}
          {@render header('playlists', C.colPlaylists, 'num')}
          {@render header('counted', C.colCounted, 'num')}
          <th class="action"><span class="visually-hidden">{C.count}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each visible as row (row.key)}
          {@const s = summaries.get(row.key) ?? null}
          {@const counted = s && !s.unknown}
          {@const avatar = avatarOf(row)}
          <tr>
            <td class="channel"><div class="channel-inner">
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
              <span class="name-cell">
                {#if row.url}
                  <a class="plain name" href={row.url} target="_blank" rel="noreferrer">{row.name}</a>
                {:else}
                  <span class="name">{row.name}</span>
                {/if}
                {#if row.subscribed}<span class="badge">{C.subscribed}</span>{/if}
              </span>
            </div></td>
            <td class="num">{n(row.watched)}</td>
            <td class="num">{row.seconds ? formatWatchTime(row.seconds) : '–'}</td>
            {#if counted}
              <!-- The breakdown (videos, Shorts, live …) as tooltip. -->
              <td class="num" title={s!.text}>{n(s!.seen)} / {n(s!.total)}</td>
              <td class="num share">
                {#if s!.total}
                  <span class="bar"><span style:width={`${(s!.seen / s!.total) * 100}%`}></span></span>
                  {Math.round((s!.seen / s!.total) * 100)} %
                {:else}–{/if}
              </td>
              <td class="num">{s!.playlistsTotal ? `${n(s!.playlistsDone)} / ${n(s!.playlistsTotal)}` : '–'}</td>
              <td class="num muted">{s!.countedAt ? formatDate(s!.countedAt) : '–'}</td>
            {:else}
              <td class="num muted" colspan="4">
                {row.channelId ? (counting.has(row.channelId) ? C.counting : C.notCounted) : C.noChannelId}
              </td>
            {/if}
            <td class="action">
              {#if row.channelId}
                <button
                  class="link"
                  title={C.count}
                  disabled={counting.has(row.channelId)}
                  onclick={() => count(row.channelId!)}>{counting.has(row.channelId) ? '…' : '↻'}</button
                >
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
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
  /* Wide table: scrolls sideways on narrow windows instead of squeezing. */
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    white-space: nowrap;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  th {
    font-weight: 500;
    color: var(--muted);
    font-size: 0.9em;
  }
  .num {
    text-align: right;
  }
  th.num .sort {
    justify-content: flex-end;
  }
  .sort {
    display: inline-flex;
    width: 100%;
    gap: 4px;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .sort:hover,
  .sort.active {
    color: var(--fg);
  }
  .arrow {
    min-width: 0.8em;
    color: var(--accent);
    font-size: 0.8em;
  }
  td.channel {
    white-space: normal;
  }
  .channel-inner {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .name-cell {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }
  .avatar {
    flex: none;
    width: 32px;
    height: 32px;
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
  .name {
    font-weight: 500;
  }
  .badge {
    padding: 0 6px;
    border-radius: 4px;
    background: var(--border);
    font-size: 0.8em;
  }
  /* Share as a small bar in the accent color, the number next to it. */
  .share .bar {
    display: inline-block;
    width: 48px;
    height: 6px;
    margin-right: 6px;
    border-radius: 3px;
    background: var(--border);
    vertical-align: middle;
    overflow: hidden;
  }
  .share .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .action {
    width: 1%;
    text-align: right;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
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
