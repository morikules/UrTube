<script lang="ts">
  /** Shown once after installing (opened by the background script). */
  import { appName, t } from '@/lib/i18n';
  import type { Settings } from '@/lib/settings';
  import { prefs, setPref } from './prefs.svelte';

  const name = appName();
  const languages: { id: Settings['language']; label: string }[] = [
    { id: 'auto', label: t.design.languageAuto },
    { id: 'en', label: 'English' },
    { id: 'de', label: 'Deutsch' },
  ];
</script>

<section class="welcome">
  <h2>{t.welcome.title(name)}</h2>
  <p class="tagline">{t.about.tagline}</p>
  <p class="lead">{t.welcome.lead}</p>

  <ol class="steps">
    {#each t.welcome.steps as [title, text], i}
      <li>
        <span class="num">{i + 1}</span>
        <div>
          <b>{title}</b>
          <p class="muted">{text}</p>
        </div>
      </li>
    {/each}
  </ol>

  {#if prefs.s}
    <div class="lang">
      <span>{t.welcome.language}</span>
      <select value={prefs.s.language} onchange={(e) => setPref('language', e.currentTarget.value as Settings['language'])}>
        {#each languages as l}<option value={l.id}>{l.label}</option>{/each}
      </select>
    </div>
  {/if}

  <p class="muted small">{t.welcome.feedback}</p>

  <div class="buttons">
    <a class="button primary" href="#history">{t.welcome.startButton}</a>
    <a class="button" href="#data/import">{t.welcome.importButton}</a>
    <a class="button" href="#settings/capture">{t.welcome.settingsButton}</a>
  </div>
</section>

<style>
  .welcome {
    max-width: 680px;
  }
  h2 {
    font-size: 1.4em;
    margin-bottom: 6px;
  }
  .tagline {
    margin: 0 0 12px;
    color: var(--accent);
    font-weight: 600;
  }
  .lead {
    margin: 0 0 18px;
    line-height: 1.6;
  }
  .steps {
    list-style: none;
    margin: 0 0 18px;
    padding: 0;
    border-top: 1px solid var(--border);
  }
  .steps li {
    display: flex;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .num {
    flex: none;
    width: 1.6em;
    color: var(--accent);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .steps p {
    margin: 2px 0 0;
    line-height: 1.55;
  }
  .lang {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  a.button {
    text-decoration: none;
    display: inline-block;
  }
</style>
