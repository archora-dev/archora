<script lang="ts">
  import SearchIcon from './SearchIcon.svelte';
  import { cn } from '$lib/utils/cn';

  export let route: 'home' | 'settings' | 'profile' = 'home';
</script>

<header class={cn('app-header', 'border-b')}>
  <button on:click={() => (route = 'home')}>Home</button>
  <button on:click={() => (route = 'settings')}>Settings</button>
  <button on:click={() => (route = 'profile')}>Profile</button>
  <SearchIcon />
</header>
