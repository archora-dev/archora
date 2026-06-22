<script setup lang="ts">
import { computed } from 'vue';
import { FilterChip, Tooltip } from '@/shared/ui';
import { FINDING_TYPES, type FindingSeverity, type FindingType } from '@/entities/finding';

const props = defineProps<{
  activeTypes: FindingType[];
  activeSeverities: FindingSeverity[];
  includeBeta: boolean;
  countsByType: Record<FindingType, number>;
}>();

const emit = defineEmits<{
  (e: 'toggle-type', type: FindingType): void;
  (e: 'toggle-severity', severity: FindingSeverity): void;
  (e: 'update:includeBeta', value: boolean): void;
}>();

const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];
const visibleTypes = computed(() => FINDING_TYPES.filter((type) => props.countsByType[type] > 0));

const typeLabels: Record<FindingType, string> = {
  cycle: 'Cycles',
  'layer-violation': 'Layers',
  hotspot: 'Hotspots',
  contract: 'Contracts',
  coupling: 'Coupling',
  memory: 'Memory',
  'async-lifecycle': 'Async',
  setup: 'Setup',
};

const typeTerms: Record<FindingType, string> = {
  cycle:
    'A loop where modules import each other directly or transitively, so none can change alone.',
  'layer-violation':
    'An import that crosses a forbidden architectural boundary (e.g. shared importing a feature).',
  hotspot:
    'A module that is both heavily connected and frequently changed — risk concentrates here.',
  contract: 'An import that breaks an explicit rule, including server/client boundary leaks.',
  coupling: 'Files that keep changing together in git history despite no direct dependency.',
  memory: 'A heuristic signal of a likely leak — listeners or timers without cleanup.',
  'async-lifecycle': 'A heuristic signal of async work racing component mount/unmount.',
  setup: 'A configuration issue affecting how the project is scanned or resolved.',
};

const severityLabels: Record<FindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};
</script>

<template>
  <aside class="filter-rail" data-test="filter-rail">
    <p class="rail-label">Type</p>
    <Tooltip v-for="type in visibleTypes" :key="type" :content="typeTerms[type]" placement="right">
      <span :data-test="`type-${type}`" class="chip-wrapper" @click="emit('toggle-type', type)">
        <FilterChip :active="props.activeTypes.includes(type)" @toggle="emit('toggle-type', type)">
          {{ typeLabels[type] }} ({{ props.countsByType[type] }})
        </FilterChip>
      </span>
    </Tooltip>

    <p class="rail-label">Severity</p>
    <span
      v-for="severity in severities"
      :key="severity"
      :data-test="`severity-${severity}`"
      class="chip-wrapper"
      @click="emit('toggle-severity', severity)"
    >
      <FilterChip
        :active="props.activeSeverities.includes(severity)"
        @toggle="emit('toggle-severity', severity)"
      >
        {{ severityLabels[severity] }}
      </FilterChip>
    </span>

    <button
      type="button"
      class="beta-toggle"
      data-test="toggle-beta"
      @click="emit('update:includeBeta', !props.includeBeta)"
    >
      {{ props.includeBeta ? 'Beta heuristics: on' : 'Beta heuristics: off' }}
    </button>
  </aside>
</template>

<style scoped>
.filter-rail {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
  padding: var(--arch-space-3, 0.75rem);
  border-right: 1px solid var(--arch-color-border);
}
.rail-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
  margin: var(--arch-space-2, 0.5rem) 0 0;
}
.chip-wrapper {
  display: contents;
}
.beta-toggle {
  margin-top: var(--arch-space-3, 0.75rem);
  background: transparent;
  border: 1px dashed var(--arch-color-border);
  color: var(--arch-color-fg-muted);
  border-radius: var(--arch-radius-sm, 0.375rem);
  padding: 0.25rem 0.5rem;
  font: inherit;
  cursor: pointer;
}
</style>
