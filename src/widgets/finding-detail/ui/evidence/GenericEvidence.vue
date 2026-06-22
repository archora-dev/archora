<script setup lang="ts">
import type { Finding } from '@/entities/finding';
defineProps<{ finding: Finding }>();
</script>
<template>
  <ul class="evidence-modules">
    <li v-for="m in finding.modules" :key="m">{{ m }}</li>
  </ul>
</template>
<style scoped>
.evidence-modules {
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.8125rem;
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
</style>
