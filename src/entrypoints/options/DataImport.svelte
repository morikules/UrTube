<script lang="ts">
  import { TrackerDB, importTakeout, importWatchmarker } from '@/lib/db';
  import { n, t } from '@/lib/i18n';
  import { send } from '@/lib/messages';
  import { parseTakeout, type TakeoutFile } from '@/lib/takeout';
  import { mergeExports, parseExport, type WatchmarkerEntry } from '@/lib/watchmarker';
  import { formatDate } from '@/lib/youtube';
  import Notice from './Notice.svelte';
  import Rich from './Rich.svelte';
  import { createRunner } from './prefs.svelte';

  let { ondatachange }: { ondatachange: () => void } = $props();

  const I = t.import;

  interface LoadedFile {
    name: string;
    entries: WatchmarkerEntry[];
    oldest: number;
    newest: number;
  }

  // raw: tens of thousands of entries per file must not become deep proxies
  let files = $state.raw<LoadedFile[]>([]);
  let fileErrors = $state<string[]>([]);
  const runner = createRunner();

  async function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const loaded: LoadedFile[] = [];
    fileErrors = [];
    runner.state.message = '';
    for (const file of input.files ?? []) {
      try {
        const entries = parseExport(await file.text());
        let oldest = Infinity;
        let newest = -Infinity;
        for (const x of entries) {
          oldest = Math.min(oldest, x.intTimestamp);
          newest = Math.max(newest, x.intTimestamp);
        }
        loaded.push({ name: file.name, entries, oldest, newest });
      } catch (err) {
        fileErrors.push(`${file.name}: ${err}`);
      }
    }
    files = loaded.sort((a, b) => a.newest - b.newest);
  }

  function runImport() {
    return runner.run(async () => {
      const summary = await importWatchmarker(new TrackerDB(), mergeExports(files.map((f) => f.entries)));
      await send({ type: 'reloadCache' });
      ondatachange();
      files = [];
      return I.wmResult(n(summary.videos), n(summary.views));
    });
  }

  interface LoadedTakeout extends TakeoutFile {
    name: string;
    oldest: number;
    newest: number;
    music: number;
  }

  let takeout = $state.raw<LoadedTakeout | null>(null);
  let takeoutError = $state('');
  const takeoutRunner = createRunner();

  async function onTakeoutFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    takeout = null;
    takeoutError = '';
    takeoutRunner.state.message = '';
    if (!file) return;
    try {
      const parsed = parseTakeout(await file.text());
      let oldest = Infinity;
      let newest = -Infinity;
      for (const x of parsed.entries) {
        oldest = Math.min(oldest, x.at);
        newest = Math.max(newest, x.at);
      }
      const music = parsed.entries.filter((x) => x.music).length;
      takeout = { ...parsed, name: file.name, oldest, newest, music };
    } catch (err) {
      takeoutError = `${file.name}: ${err}`;
    }
  }

  function runTakeoutImport() {
    const data = takeout;
    if (!data) return;
    return takeoutRunner.run(async () => {
      const s = await importTakeout(new TrackerDB(), data.entries);
      await send({ type: 'reloadCache' });
      ondatachange();
      takeout = null;
      return I.takeoutResult(n(s.added), n(s.newVideos), n(s.known), n(s.dated)) + (s.deleted ? I.takeoutDeleted(n(s.deleted)) : '');
    });
  }
</script>

<p class="muted intro">{I.intro}</p>

<section>
  <h2>{I.takeoutTitle}</h2>
  <p class="muted">{I.takeoutIntro}</p>
  <div class="box">
    <ol class="steps">
      <li>
        <a href="https://takeout.google.com" target="_blank" rel="noreferrer">takeout.google.com</a>
        <Rich text={I.takeoutStep1} />
      </li>
      <li><Rich text={I.takeoutStep2} /></li>
      <li><Rich text={I.takeoutStep3} /></li>
    </ol>
    <p>
      <input type="file" accept=".json" onchange={onTakeoutFile} disabled={takeoutRunner.state.busy} />
    </p>

    {#if takeoutError}
      <p class="error">{takeoutError}</p>
    {/if}

    {#if takeout}
      {#if takeout.entries.length}
        <table>
          <tbody>
            <tr><td>{I.views}</td><td class="num">{n(takeout.entries.length)}</td></tr>
            <tr><td>{I.music}</td><td class="num">{n(takeout.music)}</td></tr>
            <tr><td>{I.period}</td><td>{formatDate(takeout.oldest)} – {formatDate(takeout.newest)}</td></tr>
            <tr><td>{I.skippedAds}</td><td class="num">{n(takeout.ads)}</td></tr>
            <tr><td>{I.skippedNoVideo}</td><td class="num">{n(takeout.noVideo)}</td></tr>
          </tbody>
        </table>
        <p>
          <button class="primary" onclick={runTakeoutImport} disabled={takeoutRunner.state.busy}>
            {takeoutRunner.state.busy ? t.common.importing : I.takeoutButton}
          </button>
        </p>
      {:else}
        <p class="error">{I.noVideos}</p>
      {/if}
    {/if}
  </div>
  <Notice message={takeoutRunner.state.message} error={takeoutRunner.state.error} />
</section>

<section>
  <h2>{I.wmTitle}</h2>
  <p class="muted"><Rich text={I.wmIntro} /></p>
  <div class="box">
    <p>
      <input type="file" accept=".database" multiple onchange={onFiles} disabled={runner.state.busy} />
    </p>

    {#each fileErrors as err}
      <p class="error">{err}</p>
    {/each}

    {#if files.length}
      <table>
        <thead>
          <tr><th>{I.file}</th><th class="num">{I.entries}</th><th>{I.period}</th></tr>
        </thead>
        <tbody>
          {#each files as f}
            <tr>
              <td>{f.name}</td>
              <td class="num">{n(f.entries.length)}</td>
              <td>{formatDate(f.oldest)} – {formatDate(f.newest)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p>
        <button class="primary" onclick={runImport} disabled={runner.state.busy}>
          {runner.state.busy ? t.common.importing : I.wmButton(files.length)}
        </button>
      </p>
    {/if}
  </div>
  <Notice message={runner.state.message} error={runner.state.error} />
</section>

<style>
  .intro {
    margin-top: 0;
  }
  .steps {
    margin: 12px 0 10px;
    padding-left: 1.4em;
    line-height: 1.6;
  }
</style>
