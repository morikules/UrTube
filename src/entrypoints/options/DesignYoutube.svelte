<script lang="ts">
  import { t } from '@/lib/i18n';
  import Toggle from './Toggle.svelte';
  import { prefs, setPref } from './prefs.svelte';

  const D = t.design;
</script>

{#if prefs.s}
  {@const s = prefs.s}
  <section>
    <h2>{D.markTitle}</h2>
    <p class="muted">{D.markIntro}</p>
    <div class="box">
      <Toggle label={D.fade} checked={s.fadeWatched} onchange={(v) => setPref('fadeWatched', v)} />
      <Toggle label={D.gray} checked={s.grayscaleWatched} onchange={(v) => setPref('grayscaleWatched', v)} />
      <Toggle label={D.badge} checked={s.showBadge} onchange={(v) => setPref('showBadge', v)} />
      <Toggle
        label={D.badgeDate}
        disabled={!s.showBadge}
        checked={s.showBadgeDate}
        onchange={(v) => setPref('showBadgeDate', v)}
      />
      <Toggle
        label={D.hideProgress}
        description={D.hideProgressDesc}
        checked={s.hideProgressBar}
        onchange={(v) => setPref('hideProgressBar', v)}
      />
      <Toggle label={D.eye} description={D.eyeDesc} checked={s.showEyeButton} onchange={(v) => setPref('showEyeButton', v)} />
    </div>
  </section>

  <section>
    <h2>{D.playlistsTitle}</h2>
    <p class="muted">{D.playlistsIntro}</p>
    <div class="box">
      <Toggle
        label={D.playlistProgress}
        checked={s.showPlaylistProgress}
        onchange={(v) => setPref('showPlaylistProgress', v)}
      />
      <Toggle
        label={D.channelStats}
        description={D.channelStatsDesc}
        checked={s.showChannelStats}
        onchange={(v) => setPref('showChannelStats', v)}
      />
    </div>
  </section>

  <section>
    <h2>{D.musicTitle}</h2>
    <p class="muted">{D.musicIntro}</p>
    <div class="box">
      <Toggle
        label={D.markMusic}
        description={D.markMusicDesc}
        checked={s.markOnYoutubeMusic}
        onchange={(v) => setPref('markOnYoutubeMusic', v)}
      />
    </div>
  </section>

  <section>
    <h2>{D.switchTitle}</h2>
    <p class="muted">{D.switchIntro}</p>
    <div class="box">
      <Toggle
        label={D.hiddenCount}
        description={D.hiddenCountDesc}
        checked={s.showHiddenCount}
        onchange={(v) => setPref('showHiddenCount', v)}
      />
    </div>
  </section>
{/if}
