<script setup lang="ts">
import { computed } from 'vue';
import { ArchTable } from '@archora/ui';
import type { ArchTableColumn, ArchTableRow } from '@archora/ui';
import { buildOwnershipView } from '@archora/core';
import type { ScanResult } from '@/core/analyzer/types';
import { useDrilldownStore } from '@/features/cockpit-view';
import { moduleLabel } from '@/shared/lib';

const props = defineProps<{ scan: ScanResult; focusedModule?: string | null }>();
const drill = useDrilldownStore();

const view = computed(() => buildOwnershipView(props.scan));

const columns = computed<ArchTableColumn[]>(() => [
  { key: 'area', label: 'Area' },
  { key: 'modules', label: 'Modules' },
  { key: 'findings', label: 'Findings' },
  { key: 'risk', label: 'Risk' },
  { key: 'kind', label: 'Primary kind' },
]);

const rows = computed<ArchTableRow[]>(() =>
  view.value.areas.map((area) => ({
    area: area.area,
    modules: area.modules,
    findings: area.findings,
    risk: Math.round(area.riskScore),
    kind: area.primaryKind,
  })),
);

const driftRows = computed<ArchTableRow[]>(() =>
  view.value.drift.map((area) => ({
    area: area.area,
    modules: area.modules,
    findings: area.findings,
    risk: Math.round(area.riskScore),
    kind: area.primaryKind,
  })),
);

function openModule(id: string): void {
  drill.drillTo('impact', id);
}
</script>

<template>
  <div class="ownership" data-test="ownership-surface">
    <p class="ownership-intro">
      Areas ranked by concentrated architectural risk — where to focus review and refactoring first.
    </p>

    <div v-if="view.areas.length === 0" class="ownership-empty">
      No area risk to report. Findings are spread thin across the codebase.
    </div>
    <ArchTable v-else :columns="columns" :rows="rows" />

    <section v-if="view.drift.length > 0" class="ownership-section">
      <h3 class="ownership-section-title">Drifting areas</h3>
      <p class="ownership-section-hint">
        Areas whose risk concentration is pulling away from the rest of the codebase.
      </p>
      <ArchTable :columns="columns" :rows="driftRows" />
    </section>

    <section v-if="view.unownedHotspots.length > 0" class="ownership-section">
      <h3 class="ownership-section-title">Loose hotspots</h3>
      <p class="ownership-section-hint">
        High-risk modules not concentrated in any single area — worth a direct look.
      </p>
      <ul class="ownership-unowned">
        <li v-for="id in view.unownedHotspots" :key="id">
          <button type="button" class="ownership-module" :title="id" @click="openModule(id)">
            {{ moduleLabel(id) }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.ownership {
  display: grid;
  gap: 1rem;
}

.ownership-intro {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.ownership-empty {
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}

.ownership-section {
  display: grid;
  gap: 0.4rem;
}

.ownership-section-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.ownership-section-hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.ownership-unowned {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ownership-module {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  background: var(--color-surface-2);
  color: var(--color-text);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    border-color var(--motion-fast),
    background-color var(--motion-fast);
}

.ownership-module:hover {
  border-color: rgb(124 109 255 / 0.4);
  background: var(--color-surface-3, var(--color-surface-2));
}
</style>
