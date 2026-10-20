<script lang="ts">
  import { t } from '@/lib/i18n';
  import Toggle from './Toggle.svelte';
  import { prefs, setPref } from './prefs.svelte';

  const D = t.design;
</script>

{#if prefs.s}
  {@const s = prefs.s}
  <section>
    <h2>{D.playerTitle}</h2>
    <p class="muted">{D.playerIntro}</p>
    <div class="box">
      <Toggle label={D.bigPlayer} checked={s.bigPlayer} onchange={(v) => setPref('bigPlayer', v)} />
      <Toggle
        label={D.autoTheater}
        disabled={!s.bigPlayer}
        checked={s.bigPlayerAutoTheater}
        onchange={(v) => setPref('bigPlayerAutoTheater', v)}
      />
      <Toggle
        label={D.hideHeader}
        description={D.hideHeaderDesc}
        disabled={!s.bigPlayer}
        checked={s.bigPlayerHideHeader}
        onchange={(v) => setPref('bigPlayerHideHeader', v)}
      />
      <Toggle
        label={D.focus}
        description={D.focusDesc}
        disabled={!s.bigPlayer}
        checked={s.bigPlayerFocus}
        onchange={(v) => setPref('bigPlayerFocus', v)}
      />
    </div>
  </section>
{/if}
