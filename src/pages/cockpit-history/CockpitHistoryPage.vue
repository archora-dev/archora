<script setup lang="ts">
import { HistoryView } from '@/widgets/history-view';
</script>

<template>
  <div class="cockpit-history-page">
    <HistoryView />
  </div>
</template>

<style scoped>
.cockpit-history-page {
  height: 100%;
  overflow-y: auto;
}
</style>
