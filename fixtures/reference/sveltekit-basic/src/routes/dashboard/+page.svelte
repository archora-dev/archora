<script lang="ts">
  import StatCard from '$lib/components/StatCard.svelte';
  import { formatNumber } from '$lib/utils/format';

  export let data: { stats: Array<{ label: string; value: number }> };
</script>

<section>
  <h1>Dashboard</h1>
  {#each data.stats as stat (stat.label)}
    <StatCard label={stat.label} value={formatNumber(stat.value)} />
  {/each}
</section>
