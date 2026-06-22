<script setup lang="ts">
import { useTheme } from '~/composables/useTheme';

const { theme, toggle } = useTheme();
</script>

<template>
  <header>
    <NuxtLink to="/">Home</NuxtLink>
    <NuxtLink to="/dashboard">Dashboard</NuxtLink>
    <button type="button" @click="toggle">Theme: {{ theme }}</button>
  </header>
</template>
