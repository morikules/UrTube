<script lang="ts">
  import { t } from '@/lib/i18n';
  import type { PlayerQuality, Settings } from '@/lib/settings';
  import { prefs, setPref } from './prefs.svelte';
  import Toggle from './Toggle.svelte';

  const P = t.playback;
  const qualities: { id: PlayerQuality; label: string }[] = [
    { id: 'auto', label: P.youtubeDecides },
    { id: 'max', label: P.highest },
    { id: 'hd2160', label: P.upTo('2160p (4K)') },
    { id: 'hd1440', label: P.upTo('1440p') },
    { id: 'hd1080', label: P.upTo('1080p') },
    { id: 'hd720', label: P.upTo('720p') },
    { id: 'large', label: P.upTo('480p') },
    { id: 'medium', label: P.upTo('360p') },
  ];
  const speeds = [0, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const captions: { id: Settings['playerCaptions']; label: string }[] = [
    { id: 'keep', label: P.youtubeDecides },
    { id: 'off', label: P.capOff },
    { id: 'on', label: P.capOn },
  ];
</script>

{#if prefs.s}
  {@const s = prefs.s}
  <section>
    <h2>{P.title}</h2>
    <p class="muted">{P.intro}</p>
    <div class="box">
      <div class="row">
        <span class="label">{P.quality}</span>
        <select value={s.playerQuality} onchange={(e) => setPref('playerQuality', e.currentTarget.value as PlayerQuality)}>
          {#each qualities as q}<option value={q.id}>{q.label}</option>{/each}
        </select>
      </div>
      <div class="row">
        <span class="label">{P.speed}</span>
        <select value={s.playerSpeed} onchange={(e) => setPref('playerSpeed', Number(e.currentTarget.value))}>
          {#each speeds as sp}<option value={sp}>{sp === 0 ? P.noChange : `${sp}×`}</option>{/each}
        </select>
      </div>
      <div class="row">
        <span class="label">{P.captions}</span>
        <select
          value={s.playerCaptions}
          onchange={(e) => setPref('playerCaptions', e.currentTarget.value as Settings['playerCaptions'])}
        >
          {#each captions as c}<option value={c.id}>{c.label}</option>{/each}
        </select>
        {#if s.playerCaptions === 'on'}
          <label class="lang">
            {P.language}
            <input
              type="text"
              maxlength="5"
              value={s.playerCaptionLang}
              onchange={(e) => setPref('playerCaptionLang', e.currentTarget.value.trim() || 'en')}
            />
            <span class="muted small">{P.langHint}</span>
          </label>
        {/if}
      </div>
    </div>
  </section>

  <section>
    <h2>{P.channelTitle}</h2>
    <p class="muted">{P.channelIntro}</p>
    <div class="box">
      <Toggle
        label={P.pauseTrailer}
        description={P.pauseTrailerDesc}
        checked={s.pauseChannelTrailer}
        onchange={(v) => setPref('pauseChannelTrailer', v)}
      />
    </div>
  </section>

  <section>
    <h2>{P.liveTitle}</h2>
    <p class="muted">{P.liveIntro}</p>
    <div class="box">
      <Toggle
        label={P.hideChat}
        description={P.hideChatDesc}
        checked={s.hideLiveChat}
        onchange={(v) => setPref('hideLiveChat', v)}
      />
    </div>
  </section>
{/if}

<style>
  .lang input {
    width: 4em;
  }
</style>
