<script lang="ts" generics="T extends string">
  /** Button that opens a small menu to pick one of several options. */
  interface Props {
    label: string;
    options: { id: T; label: string }[];
    value: T;
    onchange: (value: T) => void;
  }
  let { label, options, value, onchange }: Props = $props();

  let open = $state(false);
  let root: HTMLElement;
  const current = $derived(options.find((o) => o.id === value)?.label ?? '');

  function pick(id: T) {
    open = false;
    onchange(id);
  }

  // Close when clicking anywhere else or pressing Escape.
  function onWindowClick(e: MouseEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="dropdown" bind:this={root}>
  <button class="trigger" aria-haspopup="listbox" aria-expanded={open} onclick={() => (open = !open)}>
    {label}: <b>{current}</b> <span class="caret">▾</span>
  </button>
  {#if open}
    <ul class="menu" role="listbox">
      {#each options as o}
        <li>
          <button role="option" aria-selected={o.id === value} class:selected={o.id === value} onclick={() => pick(o.id)}>
            {o.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
  }
  .trigger {
    padding: 6px 10px;
    white-space: nowrap;
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
</style>
