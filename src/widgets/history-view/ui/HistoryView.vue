<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Badge, Button, EmptyState } from '@/shared/ui';
import { useScanStore } from '@/entities/scan';
import { useHistoryStore } from '@/entities/history';
import { buildHistoryTrend } from '../model/buildHistoryTrend';

const scan = useScanStore();
const history = useHistoryStore();

const projectId = computed(() => scan.result?.project.id ?? null);
onMounted(() => {
  if (projectId.value) void history.init(projectId.value);
});

const points = computed(() =>
  projectId.value ? buildHistoryTrend(history.forProject(projectId.value)).reverse() : [],
);
const baseline = computed(() => (projectId.value ? history.baselineFor(projectId.value) : null));

function setBaseline(scannedAt: string): void {
  if (projectId.value) void history.setBaseline(projectId.value, scannedAt);
}
function clearBaseline(): void {
  if (projectId.value) void history.clearBaseline(projectId.value);
}
</script>

<template>
  <section class="history-view" data-test="history-view">
    <EmptyState
      v-if="points.length === 0"
      title="No scans yet"
      description="Scan a project to start tracking its trend."
    />
    <template v-else>
      <header class="history-head">
        <h2>History</h2>
        <Button
          v-if="baseline"
          variant="ghost"
          size="sm"
          data-test="clear-baseline"
          @click="clearBaseline"
        >
          Clear baseline
        </Button>
      </header>
      <ul class="trend">
        <li v-for="p in points" :key="p.scannedAt" class="trend-row">
          <span class="trend-time">{{ p.scannedAt }}</span>
          <Badge :tone="p.grade === 'A' || p.grade === 'B' ? 'success' : 'warning'">{{
            p.grade
          }}</Badge>
          <span class="trend-meta">{{ `${p.findingCount} findings` }}</span>
          <Badge v-if="baseline === p.scannedAt" tone="primary">Baseline</Badge>
          <Button
            v-else
            variant="secondary"
            size="sm"
            :data-test="`set-baseline-${p.scannedAt}`"
            @click="setBaseline(p.scannedAt)"
          >
            Set baseline
          </Button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.history-view {
  padding: var(--arch-space-4, 1rem);
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.trend {
  list-style: none;
  padding: 0;
  margin: var(--arch-space-3, 0.75rem) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
}
.trend-row {
  display: flex;
  align-items: center;
  gap: var(--arch-space-2, 0.5rem);
  padding: var(--arch-space-2, 0.5rem) 0;
  border-bottom: 1px solid var(--arch-color-border);
}
.trend-time {
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.75rem;
  color: var(--arch-color-fg-muted);
  flex: 1;
}
</style>
