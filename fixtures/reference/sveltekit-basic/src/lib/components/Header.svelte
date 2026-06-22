<script lang="ts">
  import { theme, toggle } from '$lib/stores/theme';
</script>

<header>
  <a href="/">Home</a>
  <a href="/dashboard">Dashboard</a>
  <button type="button" on:click={toggle}>Theme: {$theme}</button>
</header>
