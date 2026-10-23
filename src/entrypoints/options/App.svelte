<script lang="ts">
  import type { Component } from 'svelte';
  import type { PageEvent } from '@/lib/messages';
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
    {
      id: 'stats',
      label: L.stats,
      // One pane with three views: they share the loaded data (rendered below).
      sub: [
        { id: 'videos', label: S.statsVideos, pane: StatsTab },
        { id: 'channels', label: S.statsChannels, pane: StatsTab },
        { id: 'review', label: S.statsReview, pane: StatsTab },
      ],
    },
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

  /** Bumped whenever the data changes, so the history list reloads. */
  let dataVersion = $state(0);

  function dataChanged() {
    dataVersion++;
  }

  // "Back to top" appears once the page is scrolled down a good way.
  let scrolledDown = $state(false);
  $effect(() => {
    const onScroll = () => (scrolledDown = window.scrollY > 800);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
  const icon = browser.runtime.getURL('/icon/48.png');

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
</script>

<div class="page">
  <!-- The name and logo sit at the right of the menu bar; no extra header above. -->
  <nav class="tabs">
    {#each tabs.filter((x) => !x.hidden) as tab}
      <button class:active={route.tab === tab} onclick={() => go(tab)}>{tab.label}</button>
    {/each}
    <span class="brand"><img src={icon} alt="" width="22" height="22" />{name}</span>
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
      <HistoryTab {dataVersion} onchange={() => {}} />
    {:else if route.tab.id === 'stats'}
      <StatsTab {dataVersion} view={route.subId} />
    {:else}
      {@const Current = current}
      <Current ondatachange={dataChanged} />
    {/if}
  </main>

  {#if scrolledDown}
    <button
      class="to-top"
      title={t.app.toTop}
      aria-label={t.app.toTop}
      onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button
    >
  {/if}
</div>

<style>
  .page {
    max-width: 980px;
    margin: 0 auto;
    padding: 16px 16px 64px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    padding: 0 4px;
    font-weight: 600;
    font-size: 1.05em;
  }
  .brand img {
    border-radius: 5px;
  }
  /* Just right of the page column (980 px wide, centered); at the edge on narrow windows. */
  .to-top {
    position: fixed;
    right: max(16px, calc((100vw - 980px) / 2 - 52px));
    bottom: 24px;
    z-index: 10;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--card);
    color: var(--fg);
    font-size: 18px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    cursor: pointer;
  }
  .to-top:hover {
    border-color: var(--accent);
    color: var(--accent);
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
