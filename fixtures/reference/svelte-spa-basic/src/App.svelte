<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import HomePage from './routes/HomePage.svelte';
  import { theme } from '$lib/stores/theme';

  // Lazy-loaded route — Svelte uses await import() in {#await} blocks.
  const SettingsPagePromise = import('./routes/SettingsPage.svelte');
  const ProfilePagePromise = import('./routes/ProfilePage.svelte');

  let route: 'home' | 'settings' | 'profile' = 'home';
</script>

<div data-theme={$theme}>
  <Header bind:route />
  {#if route === 'home'}
    <HomePage />
  {:else if route === 'settings'}
    {#await SettingsPagePromise then mod}
      <svelte:component this={mod.default} />
    {/await}
  {:else if route === 'profile'}
    {#await ProfilePagePromise then mod}
      <svelte:component this={mod.default} />
    {/await}
  {/if}
</div>
