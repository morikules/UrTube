<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    checked: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
    children?: Snippet;
  }
  let { checked, label, description, disabled = false, onchange, children }: Props = $props();
</script>

<div class="toggle" class:disabled>
  <label>
    <span class="text">
      <span class="label">{label}</span>
      {#if description}<span class="description">{description}</span>{/if}
    </span>
    <input
      type="checkbox"
      role="switch"
      {checked}
      {disabled}
      onchange={(e) => {
        const el = e.currentTarget;
        onchange(el.checked);
        // Show the actual setting: stays unchanged if the change was refused.
        el.checked = checked;
      }}
    />
  </label>
  {#if children}<div class="extra">{@render children()}</div>{/if}
</div>

<style>
  .toggle {
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .toggle:last-child {
    border-bottom: none;
  }
  .disabled {
    opacity: 0.55;
  }
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    cursor: pointer;
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  .description {
    color: var(--muted);
    font-size: 0.88em;
  }
  .extra {
    margin-top: 8px;
  }
  /* Switch look for the checkbox */
  input {
    appearance: none;
    flex: none;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--border);
    position: relative;
    cursor: pointer;
    transition: background 0.15s;
    margin: 0;
  }
  input::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  input:checked {
    background: var(--accent);
  }
  input:checked::after {
    transform: translateX(16px);
  }
  input:disabled {
    cursor: default;
  }
</style>
