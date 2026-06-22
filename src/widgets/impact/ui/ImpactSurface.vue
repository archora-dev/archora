<script setup lang="ts">
import { computed } from 'vue';
import { ArchTable } from '@archora/ui';
import type { ArchTableColumn, ArchTableRow } from '@archora/ui';
import type { ScanResult } from '@/core/analyzer/types';
import { buildImpactViewModel } from '@/entities/architecture';

const props = defineProps<{ scan: ScanResult; focusedModule?: string | null }>();

// When opened from a finding we get its module; otherwise default to the worst
// hotspot (more useful than an arbitrary first module).
const target = computed(
  () => props.focusedModule ?? props.scan.hotZones[0] ?? props.scan.modules[0]?.id ?? null,
);

const vm = computed(() => {
  if (!target.value) return null;
  return buildImpactViewModel(props.scan, target.value, { direction: 'both' });
});

const moduleDistanceCols = computed<ArchTableColumn[]>(() => [
  { key: 'label', label: 'Module' },
  { key: 'distance', label: 'Distance' },
]);

const dependentRows = computed<ArchTableRow[]>(() =>
  (vm.value?.incomingImporters ?? []).map((item) => ({
    label: item.label,
    distance: item.distance,
  })),
);

const dependencyRows = computed<ArchTableRow[]>(() =>
  (vm.value?.outgoingImports ?? []).map((item) => ({
    label: item.label,
    distance: item.distance,
  })),
);
</script>

<template>
  <section data-test="impact-surface" class="impact-surface">
    <header v-if="target" class="impact-head">
      <h3 class="impact-title">Impact: {{ target }}</h3>
      <p class="impact-hint">What this module depends on, and what depends on it.</p>
    </header>
    <template v-if="target && vm">
      <template v-if="vm.incomingImporters.length === 0 && vm.outgoingImports.length === 0">
        <p class="impact-empty">No dependencies or dependents for this module.</p>
      </template>
      <template v-else>
        <!-- Section: dependents (blast radius) -->
        <div v-if="dependentRows.length > 0" class="impact-section">
          <h4 class="impact-section-label">Depended on by (blast radius)</h4>
          <ArchTable :columns="moduleDistanceCols" :rows="dependentRows" :empty-text="'—'" />
        </div>
        <!-- Section: dependencies -->
        <div v-if="dependencyRows.length > 0" class="impact-section">
          <h4 class="impact-section-label">Depends on</h4>
          <ArchTable :columns="moduleDistanceCols" :rows="dependencyRows" :empty-text="'—'" />
        </div>
      </template>
    </template>
    <p v-else-if="!target" class="impact-empty">No dependencies or dependents for this module.</p>
  </section>
</template>

<style scoped>
.impact-surface {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-3, 0.75rem);
}
.impact-title {
  font-size: 0.9375rem;
  margin: 0;
  font-family: var(--arch-font-mono, monospace);
  word-break: break-all;
}
.impact-hint {
  font-size: 0.8125rem;
  color: var(--arch-color-fg-muted);
  margin: 0;
}
.impact-section {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
}
.impact-section-label {
  font-size: 0.8125rem;
  font-weight: 600;
  margin: 0;
  color: var(--arch-color-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.impact-empty {
  font-size: 0.875rem;
  color: var(--arch-color-fg-muted);
  padding: var(--arch-space-3, 0.75rem) 0;
}
</style>
