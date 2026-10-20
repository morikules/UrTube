<script lang="ts">
  let { message = '', error = '' }: { message?: string; error?: string } = $props();
</script>

{#if message}<p class="notice">{message}</p>{/if}
{#if error}<p class="notice error">{error}</p>{/if}
