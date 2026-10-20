<script lang="ts">
  import type { Component } from 'svelte';
  import type { Stats } from '@/lib/db';
  import { send, type PageEvent } from '@/lib/messages';
  import AboutTab from './AboutTab.svelte';
  import DataBackup from './DataBackup.svelte';
  import DataCleanup from './DataCleanup.svelte';
  import DataImport from './DataImport.svelte';
  import DataSync from './DataSync.svelte';
  import DesignAddon from './DesignAddon.svelte';
  import DesignPlayer from './DesignPlayer.svelte';
  import DesignYoutube from './DesignYoutube.svelte';
  import HistoryTab from './HistoryTab.svelte';
  import SettingsCapture from './SettingsCapture.svelte';
  import SettingsHide from './SettingsHide.svelte';
  import SettingsPlayback from './SettingsPlayback.svelte';
  import StatsTab from './StatsTab.svelte';
  import WelcomePage from './WelcomePage.svelte';
  import { appName, n, t } from '@/lib/i18n';
  import { prefs } from './prefs.svelte';

  /** Panes get `ondatachange`; those that do not need it simply ignore it. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Pane = Component<any>;
  interface Tab {
    id: string;
    label: string;
    /** Either one pane or several sub-tabs. */
    pane?: Pane;
    sub?: { id: string; label: string; pane: Pane }[];
    /** Reachable by address only (welcome page after installing). */
    hidden?: boolean;
  }

  const L = t.app.tabs;
  const S = t.app.sub;
  const tabs: Tab[] = [
    { id: 'history', label: L.history, pane: HistoryTab },
    { id: 'stats', label: L.stats, pane: StatsTab },
    {
      id: 'settings',
      label: L.settings,
      sub: [
        { id: 'capture', label: S.capture, pane: SettingsCapture },
        { id: 'hide', label: S.hide, pane: SettingsHide },
        { id: 'playback', label: S.playback, pane: SettingsPlayback },
      ],
    },
    {
      id: 'design',
      label: L.design,
      sub: [
        { id: 'addon', label: S.addon, pane: DesignAddon },
        { id: 'thumbnails', label: S.thumbnails, pane: DesignYoutube },
        { id: 'player', label: S.player, pane: DesignPlayer },
      ],
    },
    {
      id: 'data',
      label: L.data,
      sub: [
        { id: 'backup', label: S.backup, pane: DataBackup },
        { id: 'sync', label: S.sync, pane: DataSync },
        { id: 'import', label: S.import, pane: DataImport },
        { id: 'cleanup', label: S.cleanup, pane: DataCleanup },
      ],
    },
    { id: 'about', label: L.about, pane: AboutTab },
    { id: 'welcome', label: '', pane: WelcomePage, hidden: true },
  ];

  /** Route from the address: "#settings/hide" → tab "settings", sub-tab "hide". */
  function parseHash(): { tab: Tab; subId?: string } {
    const [tabId, subId] = location.hash.slice(1).split('/');
    const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]!;
    const sub = tab.sub?.find((s) => s.id === subId) ?? tab.sub?.[0];
    return { tab, subId: sub?.id };
  }

  // raw: the tab objects are compared by identity below
  let route = $state.raw(parseHash());
  const current = $derived.by(() => {
    const sub = route.tab.sub?.find((s) => s.id === route.subId);
    return sub?.pane ?? route.tab.pane!;
  });

  function go(tab: Tab, subId?: string) {
    const sid = subId ?? tab.sub?.[0]?.id;
    route = { tab, subId: sid };
    history.replaceState(null, '', `#${tab.id}${sid ? `/${sid}` : ''}`);
  }

  // Clicking the toolbar icon again may change the hash of this tab.
  window.addEventListener('hashchange', () => (route = parseHash()));

  let stats = $state<Stats | null>(null);
  /** Bumped whenever the data changes, so the history list reloads. */
  let dataVersion = $state(0);

  async function refreshStats() {
    stats = await send({ type: 'getStats' });
  }

  function dataChanged() {
    dataVersion++;
    refreshStats();
  }

  // The background announces every change (new views, deletions, imports).
  browser.runtime.onMessage.addListener((msg: PageEvent) => {
    if (msg?.type === 'dataChanged') dataChanged();
  });

  // Color scheme of this page.
  $effect(() => {
    const theme = prefs.s?.uiTheme;
    if (theme && theme !== 'system') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  });

  const name = appName();
  refreshStats();
</script>

<div class="page">
  <header>
    <h1>{name}</h1>
    {#if stats}
      <div class="cards">
        <div class="card"><b>{n(stats.watched)}</b><span>{t.app.watched}</span></div>
        <div class="card"><b>{n(stats.multi)}</b><span>{t.app.multi}</span></div>
      </div>
    {/if}
  </header>

  <nav class="tabs">
    {#each tabs.filter((x) => !x.hidden) as tab}
      <button class:active={route.tab === tab} onclick={() => go(tab)}>{tab.label}</button>
    {/each}
  </nav>

  {#if route.tab.sub}
    <nav class="subtabs">
      {#each route.tab.sub as s}
        <button class:active={route.subId === s.id} onclick={() => go(route.tab, s.id)}>{s.label}</button>
      {/each}
    </nav>
  {/if}

  <main>
    {#if route.tab.id === 'history'}
      <HistoryTab {dataVersion} onchange={refreshStats} />
    {:else if route.tab.id === 'stats'}
      <StatsTab {dataVersion} />
    {:else}
      {@const Current = current}
      <Current ondatachange={dataChanged} />
    {/if}
  </main>
</div>

<style>
  .page {
    max-width: 980px;
    margin: 0 auto;
    padding: 24px 16px 64px;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
  }
  .cards {
    display: flex;
    gap: 10px;
  }
  .card {
    background: var(--card);
    border-radius: 10px;
    padding: 8px 16px;
    display: flex;
    flex-direction: column;
    min-width: 130px;
  }
  .card b {
    font-size: 1.4em;
    font-variant-numeric: tabular-nums;
  }
  .card span {
    color: var(--muted);
    font-size: 0.9em;
  }
  /* Both tab rows: plain text, the active one highlighted with the card color. */
  .tabs,
  .subtabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .tabs {
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
  }
  .subtabs {
    margin-bottom: 18px;
  }
  .tabs button,
  .subtabs button {
    border: none;
    background: none;
    color: var(--muted);
  }
  .tabs button {
    padding: 8px 16px;
    border-bottom: 2px solid transparent;
    border-radius: 6px 6px 0 0;
  }
  .subtabs button {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 0.92em;
  }
  .tabs button:hover,
  .subtabs button:hover {
    color: var(--fg);
  }
  .tabs button.active,
  .subtabs button.active {
    background: var(--card);
    color: var(--fg);
    font-weight: 600;
  }
  .tabs button.active {
    border-bottom-color: var(--accent);
  }
</style>
