<script lang="ts">
  /**
   * Hidden (⊘) videos, playlists and channels: counts per kind, "show again"
   * per kind, and – only when opened – a list to bring back single entries.
   */
  import { TrackerDB, type Dismissed } from '@/lib/db';
  import { send } from '@/lib/messages';
  import { formatDate, thumbnailUrl } from '@/lib/youtube';
  import { n, t } from '@/lib/i18n';
  import ConfirmButton from './ConfirmButton.svelte';

  let { onresult }: { onresult: (message: string) => void } = $props();

  const D = t.dismissed;
  type Kind = Dismissed['kind'];
  const kinds: { id: Kind; label: string }[] = (['video', 'playlist', 'channel'] as const).map((id) => ({
    id,
    label: D.kinds[id],
  }));

  let counts = $state<Record<Kind, number> | null>(null);
  let open = $state(false);
  let filter = $state<Kind | 'all'>('all');
  let query = $state('');
  // raw: replaced as a whole on reload
  let items = $state.raw<Dismissed[]>([]);

  async function load() {
    counts = await send({ type: 'countDismissed' });
    if (!open) return;
    const db = new TrackerDB();
    const rows = (await db.dismissed.toArray()).sort((a, b) => b.at - a.at);
    // Entries from before v0.7 have no channel; watched videos know theirs.
    const missing = rows.filter((r) => r.kind === 'video' && !r.channelName);
    const videos = await db.videos.bulkGet(missing.map((r) => r.id));
    missing.forEach((r, i) => {
      const v = videos[i];
      if (v?.channelName) {
        r.channelName = v.channelName;
        r.channelKey = v.channelHandle ?? v.channelId;
      }
    });
    items = rows;
  }

  async function toggleList() {
    open = !open;
    if (open) await load();
  }

  async function showKind(kind: Kind) {
    const count = await send({ type: 'clearDismissed', kind });
    await load();
    onresult(D.shown(n(count), D.kinds[kind]));
  }

  async function showOne(item: Dismissed) {
    await send({ type: 'setDismissed', id: item.id, kind: item.kind, dismissed: false });
    await load();
  }

  const channelUrl = (key: string) =>
    key.startsWith('@') ? `https://www.youtube.com/${key}` : `https://www.youtube.com/channel/${key}`;

  function url(item: Dismissed): string {
    if (item.kind === 'video') return `https://www.youtube.com/watch?v=${item.id}`;
    if (item.kind === 'playlist') return `https://www.youtube.com/playlist?list=${item.id}`;
    return channelUrl(item.id);
  }

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (filter === 'all' || i.kind === filter) &&
        (!q ||
          i.id.toLowerCase().includes(q) ||
          (i.title?.toLowerCase().includes(q) ?? false) ||
          (i.channelName?.toLowerCase().includes(q) ?? false)),
    );
  });

  const total = $derived(counts ? counts.video + counts.playlist + counts.channel : 0);

  load();
</script>

<div class="box">
  {#if counts}
    <table class="kinds">
      <tbody>
        {#each kinds as k}
          <tr>
            <td>{k.label}</td>
            <td class="num">{n(counts[k.id])}</td>
            <td>
              {#if counts[k.id]}
                <ConfirmButton
                  label={D.showAll}
                  question={D.showAllQuestion(n(counts[k.id]), k.label)}
                  confirmLabel={D.showAllConfirm}
                  small
                  onconfirm={() => showKind(k.id)}
                />
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if total}
    <p><button class="tiny-btn" onclick={toggleList}>{open ? D.closeList : D.openList}</button></p>
  {/if}

  {#if open}
    <div class="toolbar">
      <input type="search" placeholder={D.search} bind:value={query} />
      <select bind:value={filter}>
        <option value="all">{D.all}</option>
        {#each kinds as k}<option value={k.id}>{k.label}</option>{/each}
      </select>
    </div>
    <ul class="list">
      {#each visible as item (item.kind + item.id)}
        <li>
          {#if item.kind === 'video'}
            <img src={thumbnailUrl(item.id)} alt="" loading="lazy" width="80" height="45" />
          {:else}
            <span class="kind">{item.kind === 'playlist' ? D.playlist : D.channel}</span>
          {/if}
          <div class="text">
            <a href={url(item)} target="_blank" rel="noreferrer" class="title">{item.title || item.id}</a>
            {#if item.channelName}
              {#if item.channelKey}
                <a href={channelUrl(item.channelKey)} target="_blank" rel="noreferrer" class="channel"
                  >{item.channelName}</a
                >
              {:else}
                <span class="channel">{item.channelName}</span>
              {/if}
            {/if}
          </div>
          <span class="muted small">{formatDate(item.at)}</span>
          <button class="tiny-btn" onclick={() => showOne(item)} title={D.showOneTitle}>{D.showOne}</button>
        </li>
      {:else}
        <li class="muted">{D.nothing}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .kinds {
    margin: 8px 0;
  }
  .tiny-btn {
    font-size: 0.85em;
    padding: 2px 10px;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    margin: 8px 0;
  }
  .toolbar input {
    flex: 1;
    padding: 4px 8px;
  }
  .list {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    max-height: 420px;
    overflow-y: auto;
  }
  .list li {
    display: grid;
    grid-template-columns: 80px 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .list img {
    border-radius: 4px;
    object-fit: cover;
    background: var(--bg);
  }
  .kind {
    font-size: 0.8em;
    text-align: center;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 0;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .title,
  .channel {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-decoration: none;
  }
  .channel {
    font-size: 0.85em;
    color: var(--muted);
  }
  a.title:hover,
  a.channel:hover {
    text-decoration: underline;
  }
</style>
