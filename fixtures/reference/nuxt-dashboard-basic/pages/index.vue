<script setup lang="ts">
// File-system route: GET / -> this page. Not statically imported.
import { useTheme } from '~/composables/useTheme';

const { theme } = useTheme();
</script>

<template>
  <section>
    <h1>Home</h1>
    <p>Theme: {{ theme }}</p>
  </section>
</template>
