<script lang="ts">
  /** Search field with an ✕ that empties it (Firefox shows none for type="search"). */
  import { t } from '@/lib/i18n';

  let { value = $bindable(''), placeholder }: { value: string; placeholder: string } = $props();
  let input: HTMLInputElement;
</script>

<div class="search">
  <input bind:this={input} type="search" {placeholder} bind:value />
  {#if value}
    <button
      type="button"
      class="clear"
      title={t.common.clearSearch}
      aria-label={t.common.clearSearch}
      onclick={() => {
        value = '';
        input.focus();
      }}>✕</button
    >
  {/if}
</div>

<style>
  .search {
    position: relative;
    flex: 1 1 280px;
    display: flex;
  }
  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    padding: 6px 30px 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
  }
  /* Our own ✕ instead of the browser's (some show one, some do not). */
  input::-webkit-search-cancel-button {
    display: none;
  }
  .clear {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--muted);
    font-size: 13px;
    line-height: 24px;
    cursor: pointer;
  }
  .clear:hover {
    background: var(--border);
    color: var(--fg);
  }
</style>
