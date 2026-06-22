<script lang="ts">
  import { theme, toggleTheme } from '$lib/stores/theme';
</script>

<main>
  <h1>Home</h1>
  <p>Theme: {$theme}</p>
  <button on:click={toggleTheme}>Toggle theme</button>
</main>
