<script setup lang="ts">
import { computed } from 'vue';
import { ArchTable } from '@archora/ui';
import type { ArchTableColumn, ArchTableRow } from '@archora/ui';
import { buildDeadCodeReport } from '@archora/core';
import type { ScanResult } from '@/core/analyzer/types';
import { moduleLabel, useCountUp } from '@/shared/lib';

const props = defineProps<{ scan: ScanResult; focusedModule?: string | null }>();

const report = computed(() => buildDeadCodeReport(props.scan));

const displayedTotalLoc = useCountUp(
  computed(() => report.value.totalLoc),
  { duration: 520 },
);
const displayedCandidates = useCountUp(
  computed(() => report.value.candidates.length),
  { duration: 440 },
);
const displayedIsolated = useCountUp(
  computed(() => report.value.isolatedCount),
  { duration: 440 },
);
const displayedScriptEntry = useCountUp(
  computed(() => report.value.scriptEntryCount),
  { duration: 440 },
);

const columns = computed<ArchTableColumn[]>(() => [
  { key: 'module', label: 'Module' },
  { key: 'group', label: 'Type' },
  { key: 'loc', label: 'LOC' },
]);

const rows = computed<ArchTableRow[]>(() =>
  report.value.candidates.map((candidate) => ({
    module: moduleLabel(candidate.id),
    moduleTitle: candidate.id,
    group: candidate.group === 'script-entry' ? 'Script entry' : 'Isolated',
    loc: candidate.loc,
  })),
);
</script>

<template>
  <div class="dead-code" data-test="dead-code-surface">
    <div v-if="report.candidates.length === 0" class="dead-code-empty" data-test="dead-code-empty">
      No dead-code candidates. Nothing is fully disconnected from the dependency model.
    </div>
    <template v-else>
      <div class="dead-code-stats">
        <div class="dead-code-stat dead-code-stat-primary">
          <span class="dead-code-stat-value">{{ displayedTotalLoc }}</span>
          <span class="dead-code-stat-label">Reclaimable LOC</span>
        </div>
        <div class="dead-code-stat">
          <span class="dead-code-stat-value">{{ displayedCandidates }}</span>
          <span class="dead-code-stat-label">Candidates</span>
        </div>
        <div class="dead-code-stat">
          <span class="dead-code-stat-value">{{ displayedIsolated }}</span>
          <span class="dead-code-stat-label">Isolated</span>
        </div>
        <div class="dead-code-stat">
          <span class="dead-code-stat-value">{{ displayedScriptEntry }}</span>
          <span class="dead-code-stat-label">Script entry</span>
        </div>
      </div>

      <p class="dead-code-intro">
        Modules with no resolved imports in or out — deletion candidates to review. Script entry
        points may still be invoked by package scripts or CI, so confirm before removing them.
      </p>

      <ArchTable :columns="columns" :rows="rows">
        <template #cell-module="{ row }">
          <code class="dead-code-module" :title="String(row.moduleTitle)">{{ row.module }}</code>
        </template>
      </ArchTable>
    </template>
  </div>
</template>

<style scoped>
.dead-code {
  display: grid;
  gap: 1rem;
}

.dead-code-empty {
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}

.dead-code-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.dead-code-stat {
  display: grid;
  gap: 0.15rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  background: var(--color-surface-2);
}

.dead-code-stat-primary {
  border-color: rgb(124 109 255 / 0.32);
  background: linear-gradient(135deg, rgb(124 109 255 / 0.16), rgb(56 189 248 / 0.06));
}

.dead-code-stat-value {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--color-text);
}

.dead-code-stat-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.dead-code-intro {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.dead-code-module {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
  color: var(--color-text);
}
</style>
