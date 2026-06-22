<script setup lang="ts">
// AppHeader is auto-imported via unplugin-vue-components — no script import,
// just used in the template below. AppFooter is the same.
import { useTheme } from '@/composables/useTheme';

const { theme } = useTheme();
</script>

<template>
  <div :data-theme="theme">
    <AppHeader />
    <main>
      <HomeView />
    </main>
    <AppFooter />
  </div>
</template>
