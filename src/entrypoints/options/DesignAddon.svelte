<script lang="ts">
  import { t } from '@/lib/i18n';
  import type { Settings } from '@/lib/settings';
  import { prefs, setPref } from './prefs.svelte';

  const D = t.design;
  const languages: { id: Settings['language']; label: string }[] = [
    { id: 'auto', label: D.languageAuto },
    { id: 'en', label: 'English' },
    { id: 'de', label: 'Deutsch' },
  ];
  const themes: { id: Settings['uiTheme']; label: string; description: string }[] = [
    { id: 'system', label: D.themeSystem, description: D.themeSystemDesc },
    { id: 'light', label: D.themeLight, description: '' },
    { id: 'dark', label: D.themeDark, description: '' },
  ];
</script>

{#if prefs.s}
  <section>
    <h2>{D.languageTitle}</h2>
    <p class="muted">{D.languageIntro}</p>
    <div class="box">
      {#each languages as l}
        <label class="choice">
          <input
            type="radio"
            name="language"
            value={l.id}
            checked={prefs.s.language === l.id}
            onchange={() => setPref('language', l.id)}
          />
          <span>{l.label}</span>
        </label>
      {/each}
    </div>
  </section>

  <section>
    <h2>{D.themeTitle}</h2>
    <p class="muted">{D.themeIntro}</p>
    <div class="box">
      {#each themes as th}
        <label class="choice">
          <input
            type="radio"
            name="theme"
            value={th.id}
            checked={prefs.s.uiTheme === th.id}
            onchange={() => setPref('uiTheme', th.id)}
          />
          <span>{th.label}</span>
          {#if th.description}<span class="muted small">{th.description}</span>{/if}
        </label>
      {/each}
    </div>
  </section>
{/if}

<style>
  .choice {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }
  .choice:last-child {
    border-bottom: none;
  }
</style>
