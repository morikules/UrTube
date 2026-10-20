<script lang="ts">
  import { TrackerDB, exportBackup, restoreBackup } from '@/lib/db';
  import { n, t } from '@/lib/i18n';
  import { send } from '@/lib/messages';
  import Notice from './Notice.svelte';
  import { createRunner } from './prefs.svelte';

  let { ondatachange }: { ondatachange: () => void } = $props();

  const B = t.backup;
  const runner = createRunner();

  function download() {
    return runner.run(async () => {
      const backup = await exportBackup(new TrackerDB());
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `urtube-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      return B.created(n(backup.videos.length));
    });
  }

  function restore(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    return runner.run(async () => {
      const r = await restoreBackup(new TrackerDB(), JSON.parse(await file.text()));
      await send({ type: 'reloadCache' });
      ondatachange();
      return B.restored(n(r.videos), n(r.views));
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
        <input type="file" accept=".json,application/json" onchange={restore} disabled={runner.state.busy} hidden />
      </label>
    </div>
    <p class="muted small">{B.restoreNote}</p>
  </div>
  <Notice message={runner.state.message} error={runner.state.error} />
</section>
