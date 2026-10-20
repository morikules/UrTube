<script lang="ts">
  /**
   * Time window in days (0 = no limit), edited as "at most N <unit> old".
   * The amount stays visible but disabled while "no limit" is ticked.
   */
  import { t } from '@/lib/i18n';

  let { days, onchange }: { days: number; onchange: (days: number) => void } = $props();

  const units = [
    { days: 365, names: t.window.units.year },
    { days: 30, names: t.window.units.month },
    { days: 7, names: t.window.units.week },
    { days: 1, names: t.window.units.day },
  ];

  const unlimited = $derived(days === 0);
  /** Remembers the last limit, so unticking "no limit" restores it. */
  let lastLimit = $state(30);
  $effect(() => {
    if (days > 0) lastLimit = days;
  });

  /** Largest unit that divides the days evenly: 90 → 3 months, 14 → 2 weeks. */
  const split = $derived.by(() => {
    const d = days || lastLimit;
    const unit = units.find((u) => d % u.days === 0)!.days;
    return { amount: d / unit, unit };
  });

  function update(amount: number, unit: number) {
    if (Number.isFinite(amount) && amount >= 1) onchange(Math.round(amount) * unit);
  }
</script>

<div class="window">
  <label>
    <input type="checkbox" checked={unlimited} onchange={(e) => onchange(e.currentTarget.checked ? 0 : lastLimit)} />
    {t.window.noLimit}
  </label>
  <span class:disabled={unlimited}>
    {t.window.otherwise}
    <input
      type="number"
      min="1"
      max="999"
      disabled={unlimited}
      value={split.amount}
      onchange={(e) => update(Number(e.currentTarget.value), split.unit)}
    />
    <select disabled={unlimited} value={split.unit} onchange={(e) => update(split.amount, Number(e.currentTarget.value))}>
      {#each units as u}
        <option value={u.days}>{split.amount === 1 ? u.names[0] : u.names[1]}</option>
      {/each}
    </select>
    {t.window.old}
  </span>
</div>

<style>
  .window {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    align-items: center;
  }
  input[type='number'] {
    width: 4.5em;
  }
  .disabled {
    opacity: 0.45;
  }
</style>
