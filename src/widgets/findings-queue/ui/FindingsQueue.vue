<script setup lang="ts">
import { computed } from 'vue';
import { EmptyState, SeverityMarker, VirtualList } from '@/shared/ui';
import type { Finding, FindingText } from '@/entities/finding';
import { useFindingTriageStore, type TriageState } from '@/entities/finding-triage';

const props = defineProps<{
  findings: Finding[];
  selectedId: string | null;
  loading: boolean;
  projectId?: string | null;
}>();

const emit = defineEmits<{ (e: 'select', id: string): void }>();

const triageStore = useFindingTriageStore();

const triageLabels: Record<Exclude<TriageState, 'active'>, string> = {
  acknowledged: 'Acknowledged',
  snoozed: 'Snoozed',
  'wont-fix': "Won't fix",
};

// Touch the reactive project map so badges update when triage changes.
const triageMap = computed(() =>
  props.projectId ? triageStore.forProject(props.projectId) : null,
);

function triageState(findingId: string): TriageState {
  return triageMap.value?.[findingId]?.state ?? 'active';
}

/** Badge text for a triaged finding, or '' when active (no badge rendered). */
function triageLabel(findingId: string): string {
  const state = triageState(findingId);
  return state === 'active' ? '' : triageLabels[state];
}

const findingTitles: Record<string, (p: Record<string, string | number>) => string> = {
  'entities.finding.cycle.title': (p) => `Dependency cycle across ${p.count} modules`,
  'entities.finding.cluster.title': (p) => `Tangled cluster of ${p.count} modules`,
  'entities.finding.layerViolation.title': (p) => `Layer violation: ${p.from} → ${p.to}`,
  'entities.finding.hotspot.title': (p) => `Hotspot: ${p.module}`,
  'entities.finding.contract.title': (p) => `Contract violation: ${p.rule}`,
  'entities.finding.rscLeak.title': (p) => `Server/client boundary leak: ${p.rule}`,
  'entities.finding.coupling.title': (p) => `Hidden coupling: ${p.a} ↔ ${p.b}`,
  'entities.finding.memory.title': (p) => `Memory risk: ${p.kind}`,
  'entities.finding.asyncLifecycle.title': (p) => `Async lifecycle risk: ${p.kind}`,
  'entities.finding.setup.title': (p) => `Config issue: ${p.field}`,
};

function findingTitle(title: FindingText): string {
  const render = findingTitles[title.i18nKey];
  return render ? render(title.params) : title.i18nKey;
}
</script>

<template>
  <section class="findings-queue" data-test="findings-queue">
    <EmptyState
      v-if="!props.loading && props.findings.length === 0"
      data-test="queue-empty"
      title="No findings"
      description="Nothing matches the current filters."
    />
    <VirtualList v-else :items="props.findings" :item-height="56" :key-fn="(f: Finding) => f.id">
      <template #default="{ item }">
        <button
          type="button"
          class="queue-row"
          :class="{
            selected: item.id === props.selectedId,
            triaged: triageState(item.id) !== 'active',
          }"
          :data-test="`finding-${item.id}`"
          @click="emit('select', item.id)"
        >
          <SeverityMarker :severity="item.severity" size="sm" />
          <span class="queue-title">{{ findingTitle(item.title) }}</span>
          <span v-if="item.location" class="queue-location">{{ item.location }}</span>
          <span
            v-if="triageLabel(item.id)"
            class="queue-triage"
            :data-test="`finding-triage-${item.id}`"
            >{{ triageLabel(item.id) }}</span
          >
          <span v-if="item.beta" class="queue-beta">beta</span>
        </button>
      </template>
    </VirtualList>
  </section>
</template>

<style scoped>
.findings-queue {
  height: 100%;
  overflow: hidden;
}
.queue-row {
  display: flex;
  align-items: center;
  gap: var(--arch-space-2, 0.5rem);
  width: 100%;
  height: 56px;
  padding: 0 var(--arch-space-3, 0.75rem);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--arch-color-border);
  color: var(--arch-color-fg);
  cursor: pointer;
  text-align: left;
}
.queue-row.selected {
  background: color-mix(in srgb, var(--arch-color-primary) 12%, transparent);
}
.queue-row.triaged {
  opacity: 0.55;
}
.queue-triage {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.0625rem 0.375rem;
  border-radius: var(--arch-radius-sm, 0.25rem);
  background: color-mix(in srgb, var(--arch-color-fg-muted) 16%, transparent);
  color: var(--arch-color-fg-muted);
  white-space: nowrap;
}
.queue-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-location {
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.75rem;
  color: var(--arch-color-fg-muted);
}
.queue-beta {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--arch-color-warning);
}
</style>
