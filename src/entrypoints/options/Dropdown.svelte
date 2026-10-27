<script lang="ts" generics="T extends string">
  /**
   * Button that opens a small menu to pick one of several options – or, with
   * `multiple`, several at once (the first option, e.g. "All", clears them).
   */
  import { t } from '@/lib/i18n';
  interface Props {
    label: string;
    options: { id: T; label: string }[];
    value?: T;
    onchange?: (value: T) => void;
    /** Several options at once: `values` (without the first option) and `onchangemany`. */
    multiple?: boolean;
    values?: T[];
    onchangemany?: (values: T[]) => void;
    /** Show an ✕ that sets the first option again (e.g. "All") when another one is chosen. */
    resettable?: boolean;
  }
  let {
    label,
    options,
    value,
    onchange,
    multiple = false,
    values = [],
    onchangemany,
    resettable = false,
  }: Props = $props();
  const first = $derived(options[0]?.id);
  const changed = $derived(resettable && options.length > 0 && (multiple ? values.length > 0 : value !== first));

  let open = $state(false);
  let root: HTMLElement;
  const labelOf = (id: T | undefined) => options.find((o) => o.id === id)?.label ?? '';
  const current = $derived(
    !multiple
      ? labelOf(value)
      : values.length === 0
        ? labelOf(first)
        : values.length === 1
          ? labelOf(values[0])
          : `${labelOf(values[0])} +${values.length - 1}`,
  );
  const isSelected = (id: T) => (multiple ? (values.length ? values.includes(id) : id === first) : id === value);

  function pick(id: T) {
    if (!multiple) {
      open = false;
      onchange?.(id);
      return;
    }
    // The first option clears the choice; the others are switched on and off, the menu stays open.
    if (id === first) {
      open = false;
      onchangemany?.([]);
    } else {
      onchangemany?.(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
    }
  }

  function reset() {
    if (multiple) onchangemany?.([]);
    else if (first !== undefined) onchange?.(first);
  }

  // Close when clicking anywhere else or pressing Escape.
  function onWindowClick(e: MouseEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="dropdown" class:changed bind:this={root}>
  <button class="trigger" aria-haspopup="listbox" aria-expanded={open} onclick={() => (open = !open)}>
    {label}: <b>{current}</b> <span class="caret">▾</span>
  </button>
  {#if changed}
    <button class="reset" title={t.common.resetFilter} aria-label={t.common.resetFilter} onclick={reset}>✕</button>
  {/if}
  {#if open}
    <ul class="menu" role="listbox" aria-multiselectable={multiple}>
      {#each options as o}
        <li>
          <button role="option" aria-selected={isSelected(o.id)} class:selected={isSelected(o.id)} onclick={() => pick(o.id)}>
            {#if multiple}<span class="check">{isSelected(o.id) ? '✓' : ''}</span>{/if}{o.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
    display: flex;
  }
  .trigger {
    padding: 6px 10px;
    white-space: nowrap;
  }
  /* A chosen filter: highlighted, with the ✕ joined to the right of the button. */
  .changed .trigger {
    border-color: var(--accent);
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .reset {
    padding: 6px 9px;
    margin-left: -1px;
    border-color: var(--accent);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    color: var(--muted);
  }
  .reset:hover {
    color: var(--accent);
  }
  .caret {
    color: var(--muted);
    margin-left: 2px;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    min-width: 100%;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  }
  .menu button {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    border-radius: 4px;
    padding: 6px 10px;
    white-space: nowrap;
  }
  .menu button:hover {
    background: var(--card);
  }
  .menu button.selected {
    font-weight: 600;
    color: var(--accent);
  }
  /* Room for the ✓ in front of chosen options, so the labels stay aligned. */
  .check {
    display: inline-block;
    width: 1.2em;
  }
</style>
