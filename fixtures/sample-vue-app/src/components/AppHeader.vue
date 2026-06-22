<script setup lang="ts">
import Logo from '@/components/Logo.vue';
import { useTheme } from '@/composables/useTheme';
const { mode } = useTheme();
</script>

<template>
  <header><Logo /> <span>{{ mode }}</span></header>
</template>
