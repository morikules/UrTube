<script lang="ts">
  /** Horizontal bars with label and value (single series, e.g. top channels). */
  import { n } from '@/lib/i18n';
  interface Props {
    /** With `url`, the label opens that page (e.g. the channel). */
    rows: { label: string; count: number; url?: string }[];
    unit: (count: number) => string;
  }
  let { rows, unit }: Props = $props();
  const max = $derived(Math.max(1, ...rows.map((r) => r.count)));
</script>

<table class="bars">
  <tbody>
    {#each rows as r}
      <tr title={`${r.label}: ${unit(r.count)}`}>
        <td class="label">
          {#if r.url}<a class="plain" href={r.url} target="_blank" rel="noreferrer">{r.label}</a>{:else}{r.label}{/if}
        </td>
        <td class="track"><span class="bar" style:width={`${(r.count / max) * 100}%`}></span></td>
        <td class="num">{n(r.count)}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .bars {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: 4px 0;
  }
  .label {
    width: 40%;
    max-width: 0;
    padding-right: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    width: 50%;
  }
  .bar {
    display: block;
    height: 12px;
    min-width: 2px;
    background: var(--series-1);
    /* 4px rounded data end, square at the baseline */
    border-radius: 0 4px 4px 0;
  }
  .num {
    width: 10%;
    padding-left: 10px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
</style>
