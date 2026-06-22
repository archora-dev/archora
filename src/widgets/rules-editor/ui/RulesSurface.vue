<script setup lang="ts">
import { computed } from 'vue';
import { ArchTable } from '@archora/ui';
import type { ArchTableColumn, ArchTableRow } from '@archora/ui';
import type { ScanResult } from '@/core/analyzer/types';
import { buildRulesViewModel } from '@/entities/architecture';

const props = defineProps<{ scan: ScanResult; focusedModule?: string | null }>();

const columns = computed<ArchTableColumn[]>(() => [
  { key: 'ruleName', label: 'Rule' },
  { key: 'severity', label: 'Severity' },
  { key: 'sourceModule', label: 'From', align: 'start' },
  { key: 'targetModule', label: 'To', align: 'start' },
]);

const rows = computed<ArchTableRow[]>(
  () => buildRulesViewModel(props.scan).items as unknown as ArchTableRow[],
);
</script>

<template>
  <section data-test="rules-surface">
    <header class="surface-intro">
      <h3>What this is</h3>
      <p>
        Architecture rules you declared in .archora.json (layer boundaries, contracts) and where the
        code breaks them.
      </p>
    </header>
    <ArchTable :columns="columns" :rows="rows">
      <template #cell-sourceModule="{ value }">
        <span class="rule-path" :title="String(value)">{{ value }}</span>
      </template>
      <template #cell-targetModule="{ value }">
        <span class="rule-path" :title="String(value)">{{ value }}</span>
      </template>
    </ArchTable>
  </section>
</template>

<style scoped>
.surface-intro {
  margin-bottom: var(--arch-space-3, 0.75rem);
}
.surface-intro h3 {
  margin: 0 0 0.25rem;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
.surface-intro p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--arch-color-fg-muted);
}
.rule-path {
  display: block;
  min-width: 12rem;
  max-width: 28rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.8125rem;
  text-align: left;
}
</style>
