<script lang="ts">
  /**
   * Single-series column chart (one value per month). No legend: the section
   * title names the series. Hover shows the exact value.
   */
  import { t } from '@/lib/i18n';
  interface Props {
    data: { label: string; value: number }[];
    /** Text for the tooltip, e.g. (v) => `${v} Videos`. */
    unit: (value: number) => string;
  }
  let { data, unit }: Props = $props();

  const H = 180;
  const PAD = { top: 12, right: 8, bottom: 22, left: 40 };
  const BAR_MAX = 24;

  let width = $state(600);
  let hover = $state<number | null>(null);

  /** Clean axis maximum (1, 2, 5 × 10^n) and three ticks. */
  const scale = $derived.by(() => {
    const max = Math.max(1, ...data.map((d) => d.value));
    const pow = 10 ** Math.floor(Math.log10(max));
    const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= max)!;
    return { max: nice, ticks: [0, nice / 2, nice] };
  });

  const plotW = $derived(Math.max(50, width - PAD.left - PAD.right));
  const plotH = H - PAD.top - PAD.bottom;
  const band = $derived(plotW / Math.max(1, data.length));
  const barW = $derived(Math.min(BAR_MAX, band * 0.7));
  /** Show every n-th month label so they never collide. */
  const labelEvery = $derived(Math.max(1, Math.ceil(48 / band)));

  const y = (v: number) => PAD.top + plotH - (v / scale.max) * plotH;
  const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v));

  /** Column with 4px rounded top, square at the baseline. */
  function columnPath(x: number, top: number, w: number, base: number): string {
    const r = Math.min(4, w / 2, base - top);
    if (base - top < 0.5) return '';
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  }
</script>

<div class="chart" bind:clientWidth={width}>
  <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label={t.stats.chartLabel}>
    {#each scale.ticks as t}
      <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
      <text class="tick" x={PAD.left - 6} y={y(t) + 4} text-anchor="end">{compact(t)}</text>
    {/each}
    {#each data as d, i}
      {@const x = PAD.left + i * band + (band - barW) / 2}
      <!-- Hit target: the whole band, taller than the column -->
      <rect
        class="hit"
        x={PAD.left + i * band}
        y={PAD.top}
        width={band}
        height={plotH}
        role="presentation"
        onmouseenter={() => (hover = i)}
        onmouseleave={() => (hover = null)}
      />
      <path class="bar" class:dim={hover !== null && hover !== i} d={columnPath(x, y(d.value), barW, y(0))} />
      <!-- Counted from the end: the latest period is always labeled, none collide -->
      {#if (data.length - 1 - i) % labelEvery === 0}
        <text class="tick" x={x + barW / 2} y={H - 6} text-anchor="middle">{d.label}</text>
      {/if}
    {/each}
    <line class="baseline" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
  </svg>
  {#if hover !== null && data[hover]}
    {@const d = data[hover]!}
    <div
      class="tooltip"
      style:left={`${Math.min(width - 120, Math.max(0, PAD.left + hover * band + band / 2 - 60))}px`}
      style:top={`${Math.max(0, y(d.value) - 44)}px`}
    >
      <b>{d.label}</b><br />{unit(d.value)}
    </div>
  {/if}
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--chart-grid);
    stroke-width: 1;
  }
  .baseline {
    stroke: var(--chart-axis);
    stroke-width: 1;
  }
  .tick {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    fill: var(--series-1);
    transition: opacity 0.1s;
  }
  .bar.dim {
    opacity: 0.45;
  }
  .hit {
    fill: transparent;
  }
  .tooltip {
    position: absolute;
    width: 120px;
    pointer-events: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.85em;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
  }
</style>
