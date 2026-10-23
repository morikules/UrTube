<script lang="ts">
  import { TrackerDB, exportBackup, mergeBackup, restoreBackup } from '@/lib/db';
  import { n, t } from '@/lib/i18n';
  import { send } from '@/lib/messages';
  import Notice from './Notice.svelte';
  import { download as saveFile, videosCsv, viewsCsv } from '@/lib/history';
  import { loadSettings, normalizeSettings, saveSettings } from '@/lib/settings';
  import { createRunner } from './prefs.svelte';

  let { ondatachange }: { ondatachange: () => void } = $props();

  const B = t.backup;
  const runner = createRunner();
  let withSettings = $state(true);

  function download() {
    return runner.run(async () => {
      const backup = await exportBackup(new TrackerDB(), await loadSettings());
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `urtube-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      return B.created(n(backup.videos.length));
    });
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function exportVideos() {
    return runner.run(async () => {
      const videos = await new TrackerDB().videos.orderBy('lastViewAt').reverse().toArray();
      saveFile(videosCsv(videos), `urtube-videos-${today()}.csv`);
      return B.exported(n(videos.length));
    });
  }

  function exportViews() {
    return runner.run(async () => {
      const db = new TrackerDB();
      const [videos, views] = await Promise.all([db.videos.toArray(), db.views.toArray()]);
      saveFile(viewsCsv(views, videos), `urtube-views-${today()}.csv`);
      return B.exported(n(views.length));
    });
  }

  /** Replace everything with the backup, or merge it into the current data. */
  function restore(e: Event, merge: boolean) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    return runner.run(async () => {
      const data = JSON.parse(await file.text());
      const r = await (merge ? mergeBackup : restoreBackup)(new TrackerDB(), data);
      const settingsApplied = withSettings && r.settings !== undefined;
      await send({ type: 'reloadCache' });
      ondatachange();
      const result = merge ? B.merged(n(r.videos), n(r.views)) : B.restored(n(r.videos), n(r.views));
      const message = result + (settingsApplied ? ` ${B.settingsRestored}` : '');
      // Saving the settings reloads the page when the language changes, so it comes last.
      if (settingsApplied) await saveSettings(normalizeSettings(r.settings));
      return message;
    });
  }
</script>

<section>
  <h2>{B.title}</h2>
  <p class="muted">{B.intro}</p>
  <div class="box">
    <div class="buttons">
      <button class="primary" onclick={download} disabled={runner.state.busy}>{B.download}</button>
      <label class="button">
        {B.restore}
        <input
          type="file"
          accept=".json,application/json"
          onchange={(e) => restore(e, false)}
          disabled={runner.state.busy}
          hidden
        />
      </label>
      <label class="button">
        {B.merge}
        <input
          type="file"
          accept=".json,application/json"
          onchange={(e) => restore(e, true)}
          disabled={runner.state.busy}
          hidden
        />
      </label>
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={withSettings} />
      {B.withSettings}
    </label>
    <p class="muted small">{B.restoreNote}</p>
  </div>
  <Notice message={runner.state.message} error={runner.state.error} />
</section>

<section>
  <h2>{B.exportTitle}</h2>
  <p class="muted">{B.exportIntro}</p>
  <div class="box">
    <div class="buttons">
      <button onclick={exportVideos} disabled={runner.state.busy}>{B.exportVideos}</button>
      <button onclick={exportViews} disabled={runner.state.busy}>{B.exportViews}</button>
    </div>
  </div>
</section>

<style>
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
</style>
