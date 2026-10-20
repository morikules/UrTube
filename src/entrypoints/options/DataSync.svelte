<script lang="ts">
  import { n, t } from '@/lib/i18n';
  import { send } from '@/lib/messages';
  import { formatDateTime } from '@/lib/youtube';
  import { SYNC_CANCEL_KEY, SYNC_STATUS_KEY, type SyncStatus } from '@/lib/youtubeHistory';
  import Notice from './Notice.svelte';
  import { createRunner } from './prefs.svelte';

  let { ondatachange }: { ondatachange: () => void } = $props();

  const Y = t.sync;
  const runner = createRunner();
  let historySyncedAt = $state<number | null>(null);
  let ytStatus = $state<SyncStatus | null>(null);

  browser.storage.local.get(['browserHistorySyncedAt', SYNC_STATUS_KEY]).then((stored) => {
    historySyncedAt = (stored.browserHistorySyncedAt as number | undefined) ?? null;
    ytStatus = (stored[SYNC_STATUS_KEY] as SyncStatus | undefined) ?? null;
  });

  // The YouTube tab writes its progress to storage; show it live.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SYNC_STATUS_KEY]) {
      ytStatus = (changes[SYNC_STATUS_KEY].newValue as SyncStatus) ?? null;
      if (!ytStatus?.running) ondatachange();
    }
  });

  async function syncBrowserHistory() {
    // Must be the first await in the click handler (user gesture); no prompt if already granted.
    const granted = await browser.permissions.request({ permissions: ['history'] });
    if (!granted) {
      runner.state.error = t.common.noHistoryPermission;
      return;
    }
    await runner.run(async () => {
      const r = await send({ type: 'syncBrowserHistory' });
      if (!r.cancelled) historySyncedAt = Date.now();
      ondatachange();
      return r.cancelled ? Y.browserCancelled(n(r.scanned), n(r.added)) : Y.browserDone(n(r.scanned), n(r.added));
    });
  }

  function cancelBrowserHistory() {
    send({ type: 'cancelBrowserHistorySync' });
  }

  /** The YouTube tab checks this before each page and stops. */
  function cancelYoutubeHistory() {
    browser.storage.local.set({ [SYNC_CANCEL_KEY]: Date.now() });
  }

  async function syncYoutubeHistory() {
    runner.state.error = '';
    runner.state.message = '';
    try {
      await send({ type: 'startYoutubeHistorySync', full: true });
    } catch (e) {
      runner.state.error = String(e instanceof Error ? e.message : e);
    }
  }

  /** Copies what the sync could not understand, to send it for analysis. */
  async function copyDiagnosis() {
    const text = JSON.stringify(
      {
        unknownHeaders: ytStatus?.unknownHeaders ?? [],
        tokens: ytStatus?.tokens,
        items: ytStatus?.items,
        missingTokenSample: ytStatus?.missingTokenSample ? JSON.parse(ytStatus.missingTokenSample) : null,
      },
      null,
      1,
    );
    await navigator.clipboard.writeText(text);
    runner.state.message = Y.copied;
  }
</script>

<Notice message={runner.state.message} error={runner.state.error} />

<section>
  <h2>{Y.title}</h2>
  <p class="muted">{Y.intro}</p>
</section>

<section>
  <h2>{Y.browserTitle}</h2>
  <p class="muted">{Y.browserIntro}</p>
  <div class="box">
    <p>
      {#if runner.state.busy}
        <button onclick={cancelBrowserHistory}>{t.common.cancel}</button>
        <span class="muted small note">{Y.syncing}</span>
      {:else}
        <button onclick={syncBrowserHistory}>{Y.now}</button>
        {#if historySyncedAt}<span class="muted small note">{Y.last(formatDateTime(historySyncedAt))}</span>{/if}
      {/if}
    </p>
  </div>
</section>

<section>
  <h2>{Y.ytTitle}</h2>
  <p class="muted">{Y.ytIntro}</p>
  <div class="box">
    <p>
      {#if ytStatus?.running}
        <button onclick={cancelYoutubeHistory}>{t.common.cancel}</button>
      {:else}
        <button onclick={syncYoutubeHistory}>{Y.now}</button>
      {/if}
      {#if ytStatus}
        <span class="muted small note">
          {#if ytStatus.running}
            {Y.ytRunning(n(ytStatus.pages), n(ytStatus.items), n(ytStatus.added))}
          {:else if ytStatus.error}
            <span class="error">{Y.ytError(ytStatus.error)}</span>
          {:else if ytStatus.cancelled && ytStatus.finishedAt}
            {Y.ytCancelled(formatDateTime(ytStatus.finishedAt), n(ytStatus.pages), n(ytStatus.items), n(ytStatus.added))}
          {:else if ytStatus.finishedAt}
            {Y.ytDone(formatDateTime(ytStatus.finishedAt), n(ytStatus.items), n(ytStatus.added))}
          {/if}
        </span>
      {/if}
    </p>
    {#if ytStatus && !ytStatus.running && ytStatus.finishedAt && (ytStatus.missingTokenSample || ytStatus.unknownHeaders?.length)}
      <p class="muted small">
        {Y.notUnderstood}
        {#if ytStatus.unknownHeaders?.length}
          ({Y.dayHeaders}: {#each ytStatus.unknownHeaders as h}<code>{h}</code> {/each})
        {/if}
        <button class="tiny" onclick={copyDiagnosis}>{Y.copyDiagnosis}</button>
      </p>
    {/if}
  </div>
</section>
