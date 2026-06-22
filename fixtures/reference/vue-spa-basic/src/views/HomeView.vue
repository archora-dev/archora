<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';

const { theme } = useTheme();
</script>

<template>
  <h1>Home</h1>
  <p>Current theme: {{ theme }}</p>
</template>
