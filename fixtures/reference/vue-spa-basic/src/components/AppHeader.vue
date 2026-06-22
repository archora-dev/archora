<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
import { cn } from '@/utils/cn';

const { theme, toggle } = useTheme();
</script>

<template>
  <header :class="cn('app-header', 'border-b')">
    <span>Theme: {{ theme }}</span>
    <button type="button" @click="toggle">Toggle</button>
    <SearchIcon />
  </header>
</template>
