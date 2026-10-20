<script lang="ts">
  /** Translated text with **bold** and `code` parts (no HTML in translations). */
  let { text }: { text: string } = $props();

  const parts = $derived(
    text
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
      .filter(Boolean)
      .map((p) =>
        p.startsWith('**')
          ? { kind: 'b', value: p.slice(2, -2) }
          : p.startsWith('`')
            ? { kind: 'code', value: p.slice(1, -1) }
            : { kind: 'text', value: p },
      ),
  );
</script>

{#each parts as p}{#if p.kind === 'b'}<b>{p.value}</b>{:else if p.kind === 'code'}<code>{p.value}</code>{:else}{p.value}{/if}{/each}
