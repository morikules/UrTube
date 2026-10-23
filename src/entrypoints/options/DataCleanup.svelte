<script lang="ts">
  import { TrackerDB, clearAll, type ViewSource } from '@/lib/db';
  import { n, t } from '@/lib/i18n';
  import { META_FILL_STATUS_KEY, send, type MetaFillStatus } from '@/lib/messages';
  import { WATCH_LATER_RESULT_KEY, type WatchLaterResult } from '@/lib/playlists';
  import { formatDateTime } from '@/lib/youtube';
  import ConfirmButton from './ConfirmButton.svelte';
  import DismissedPanel from './DismissedPanel.svelte';
  import Notice from './Notice.svelte';
  import { createRunner, prefs, setPref } from './prefs.svelte';
  import Toggle from './Toggle.svelte';

  let { ondatachange }: { ondatachange: () => void } = $props();

  const C = t.cleanup;
  const runner = createRunner();

  const sourceLabels: Record<ViewSource, string> = C.sources;
  let sourceCounts = $state<Partial<Record<ViewSource, number>> | null>(null);

  async function loadSourceCounts() {
    sourceCounts = await send({ type: 'countBySource' });
  }

  function removeSource(source: ViewSource) {
    return runner.run(async () => {
      const removed = await send({ type: 'deleteBySource', source });
      await loadSourceCounts();
      ondatachange();
      return C.removed(n(removed), sourceLabels[source]);
    });
  }

  let watchLater = $state<WatchLaterResult | null>(null);
  browser.storage.local.get(WATCH_LATER_RESULT_KEY).then((s) => {
    watchLater = (s[WATCH_LATER_RESULT_KEY] as WatchLaterResult | undefined) ?? null;
  });
  // The YouTube tab writes the result to storage when it is done.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[WATCH_LATER_RESULT_KEY]) {
      watchLater = (changes[WATCH_LATER_RESULT_KEY].newValue as WatchLaterResult) ?? null;
    }
  });

  function cleanWatchLater() {
    return runner.run(async () => {
      await send({ type: 'startWatchLaterCleanup' });
      return C.watchLaterStarted;
    });
  }

  function removeDeletedFromYoutube() {
    return runner.run(async () => {
      const queued = await send({ type: 'removeDeletedFromYoutube' });
      return C.removeYtQueued(n(queued));
    });
  }

  function reset() {
    return runner.run(async () => {
      await clearAll(new TrackerDB());
      await send({ type: 'reloadCache' });
      await loadSourceCounts();
      ondatachange();
      return C.cleared;
    });
  }

  loadSourceCounts();

  // Videos still without details; filled in by a YouTube tab, so the number is re-read now and then.
  let missingMeta = $state<number | null>(null);
  let metaStatus = $state<MetaFillStatus | null>(null);
  async function loadMissingMeta() {
    missingMeta = (await send({ type: 'missingMeta', recentOnly: false, limit: 0 })).total;
    metaStatus = ((await browser.storage.local.get(META_FILL_STATUS_KEY))[META_FILL_STATUS_KEY] as MetaFillStatus) ?? null;
  }
  $effect(() => {
    loadMissingMeta();
    const timer = setInterval(loadMissingMeta, 30_000);
    return () => clearInterval(timer);
  });
</script>

<Notice message={runner.state.message} error={runner.state.error} />

<section>
  <h2>{C.sourcesTitle}</h2>
  <p class="muted">{C.sourcesIntro}</p>
  <div class="box">
    {#if sourceCounts}
      <table class="sources">
        <tbody>
          {#each Object.entries(sourceLabels) as [source, label]}
            {@const count = sourceCounts[source as ViewSource] ?? 0}
            <tr>
              <td>{label}</td>
              <td class="num">{n(count)}</td>
              <td>
                {#if count}
                  <ConfirmButton
                    label={t.common.remove}
                    question={C.removeQuestion(n(count))}
                    confirmLabel={t.common.remove}
                    danger
                    small
                    disabled={runner.state.busy}
                    onconfirm={() => removeSource(source as ViewSource)}
                  />
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>

<section>
  <h2>{C.dismissedTitle}</h2>
  <p class="muted">{C.dismissedIntro}</p>
  <DismissedPanel onresult={(m) => (runner.state.message = m)} />
</section>

<section>
  <h2>{C.watchLaterTitle}</h2>
  <p class="muted">{C.watchLaterIntro}</p>
  <div class="box">
    <p>
      <ConfirmButton
        label={C.watchLaterButton}
        question={C.watchLaterQuestion}
        confirmLabel={t.common.remove}
        disabled={runner.state.busy}
        onconfirm={cleanWatchLater}
      />
      {#if watchLater}
        <span class="muted small note">
          {t.capture.lastRun(formatDateTime(watchLater.at))}
          {t.capture.removed(n(watchLater.removed))}{#if watchLater.failed}, {t.capture.failed(n(watchLater.failed))}{/if}
          {#if watchLater.error}<span class="error"> – {watchLater.error}</span>{/if}
        </span>
      {/if}
    </p>
  </div>
</section>

<section>
  <h2>{C.removeYtTitle}</h2>
  <p class="muted">{C.removeYtIntro}</p>
  <div class="box">
    <p>
      <ConfirmButton
        label={C.removeYtButton}
        question={C.removeYtQuestion}
        confirmLabel={t.common.remove}
        disabled={runner.state.busy}
        onconfirm={removeDeletedFromYoutube}
      />
    </p>
  </div>
</section>

{#if prefs.s}
  <section>
    <h2>{C.metaTitle}</h2>
    <p class="muted">{C.metaIntro}</p>
    <div class="box">
      <Toggle
        label={C.metaAll}
        description={missingMeta === null ? undefined : C.metaMissing(n(missingMeta))}
        checked={prefs.s.fetchMissingMetaAll}
        disabled={!prefs.s.fetchMissingMeta}
        onchange={(v) => setPref('fetchMissingMetaAll', v)}
      />
      {#if metaStatus}
        <p class="muted small note">
          {t.capture.lastRun(formatDateTime(metaStatus.at))}
          {C.metaFilled(n(metaStatus.filled))}{#if metaStatus.notFound}, {C.metaNotFound(n(metaStatus.notFound))}{/if}
          {#if metaStatus.error}<span class="error"> – {metaStatus.error}</span>{/if}
        </p>
      {/if}
    </div>
  </section>
{/if}

<section>
  <h2>{C.clearTitle}</h2>
  <p class="muted">{C.clearIntro}</p>
  <div class="box">
    <p>
      <ConfirmButton
        label={C.clearButton}
        steps={[C.clearStep1, C.clearStep2]}
        confirmLabel={C.clearConfirm}
        danger
        disabled={runner.state.busy}
        onconfirm={reset}
      />
    </p>
  </div>
</section>

<style>
  .sources {
    margin: 8px 0;
  }
</style>
