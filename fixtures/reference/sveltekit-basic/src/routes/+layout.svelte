<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import { theme } from '$lib/stores/theme';
</script>

<div data-theme={$theme}>
  <Header />
  <main>
    <slot />
  </main>
</div>
