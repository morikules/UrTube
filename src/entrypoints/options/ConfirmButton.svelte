<script lang="ts">
  import { t } from '@/lib/i18n';
  /**
   * Button that asks for confirmation inline (window.confirm does not work
   * reliably on Firefox extension pages). With `steps`, several questions are
   * asked one after the other before the action runs.
   */
  interface Props {
    label: string;
    question?: string;
    /** Several questions in a row (overrides `question`). */
    steps?: string[];
    confirmLabel?: string;
    danger?: boolean;
    small?: boolean;
    disabled?: boolean;
    onconfirm: () => void;
  }
  let {
    label,
    question = t.common.sure,
    steps,
    confirmLabel = t.common.yes,
    danger = false,
    small = false,
    disabled = false,
    onconfirm,
  }: Props = $props();

  const questions = $derived(steps?.length ? steps : [question]);
  /** Index of the question being asked; -1 = not asking. */
  let stage = $state(-1);
  const last = $derived(stage === questions.length - 1);

  function confirm() {
    if (!last) {
      stage++;
      return;
    }
    stage = -1;
    onconfirm();
  }
</script>

{#if stage >= 0}
  <span class="ask" class:small>
    <span>{questions[stage]}</span>
    <button class:danger-solid={danger && last} onclick={confirm}>{last ? confirmLabel : t.common.continue}</button>
    <button onclick={() => (stage = -1)}>{t.common.cancel}</button>
  </span>
{:else}
  <button class:danger class:small {disabled} onclick={() => (stage = 0)}>{label}</button>
{/if}

<style>
  .ask {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .small,
  .small button {
    font-size: 0.85em;
  }
  .danger {
    color: var(--accent);
  }
  .danger-solid {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
