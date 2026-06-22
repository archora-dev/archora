<script setup lang="ts">
// File-system route: GET /dashboard. StatCard is auto-imported via Nuxt
// components/ convention (nested under components/dashboard/).
import { useStats } from '~/composables/useStats';
import { formatNumber } from '~/utils/format';

const { stats } = useStats();
</script>

<template>
  <section>
    <h1>Dashboard</h1>
    <StatCard v-for="s in stats" :key="s.label" :label="s.label" :value="formatNumber(s.value)" />
  </section>
</template>
