<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
const { mode, toggle } = useTheme();
</script>

<template>
  <button @click="toggle">{{ mode }}</button>
</template>
