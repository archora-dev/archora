<script setup lang="ts">
import { computed } from 'vue';
import { ArchStat } from '@archora/ui';
import { Badge, Button, KbdHint, Tooltip } from '@/shared/ui';
import { FINDING_TYPES, type FindingType } from '@/entities/finding';

const props = defineProps<{
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  total: number;
  countsByType: Record<FindingType, number>;
  lens: 'everything' | 'changed';
  hasBaseline: boolean;
  scannedAt: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:lens', value: 'everything' | 'changed'): void;
  (e: 'open-command'): void;
  (e: 'back-to-briefing'): void;
  (e: 'set-baseline'): void;
}>();

const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  cycle: 'Cycles',
  'layer-violation': 'Layers',
  hotspot: 'Hotspots',
  contract: 'Contracts',
  coupling: 'Coupling',
  memory: 'Memory',
  'async-lifecycle': 'Async',
  setup: 'Setup',
};

const visibleCounts = computed(() =>
  FINDING_TYPES.map((type) => ({ type, count: props.countsByType[type] })).filter(
    (c) => c.count > 0,
  ),
);
</script>

<template>
  <header class="health-header" data-test="health-header">
    <div class="health-grade">
      <Button
        variant="ghost"
        size="sm"
        data-test="back-to-briefing"
        @click="emit('back-to-briefing')"
      >
        ← Briefing
      </Button>
      <Tooltip
        content="An A–F read of structural health: cycles, layer breaches, and hotspots weighed against project size."
      >
        <span class="grade-stat">
          <ArchStat label="Grade" :value="props.grade" />
        </span>
      </Tooltip>
      <ArchStat label="Findings" :value="props.total" />
    </div>

    <div class="health-counts">
      <Badge v-for="c in visibleCounts" :key="c.type" tone="neutral">
        {{ FINDING_TYPE_LABELS[c.type] }} {{ c.count }}
      </Badge>
    </div>

    <div class="health-lens">
      <button
        type="button"
        data-test="lens-everything"
        :class="{ active: props.lens === 'everything' }"
        @click="emit('update:lens', 'everything')"
      >
        Everything
      </button>
      <Tooltip
        :content="
          props.hasBaseline
            ? 'Findings new since your baseline.'
            : 'No baseline yet — set one in History to track what changed.'
        "
      >
        <button
          type="button"
          data-test="lens-changed"
          :class="{ active: props.lens === 'changed' }"
          :disabled="!props.hasBaseline || undefined"
          @click="emit('update:lens', 'changed')"
        >
          Changed
        </button>
      </Tooltip>
      <Button
        v-if="!props.hasBaseline"
        variant="ghost"
        size="sm"
        data-test="set-baseline"
        @click="emit('set-baseline')"
      >
        Set baseline
      </Button>
      <Button variant="ghost" size="sm" data-test="open-command" @click="emit('open-command')">
        <KbdHint :keys="['⌘', 'K']" />
      </Button>
    </div>
  </header>
</template>

<style scoped>
.health-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--arch-space-4, 1rem);
  padding: var(--arch-space-3, 0.75rem) var(--arch-space-4, 1rem);
  border-bottom: 1px solid var(--arch-color-border);
}
.health-grade {
  display: flex;
  align-items: center;
  gap: var(--arch-space-4, 1rem);
}
.grade-stat {
  display: inline-flex;
  cursor: help;
}
.health-counts {
  display: flex;
  gap: var(--arch-space-2, 0.5rem);
  flex-wrap: wrap;
}
.health-lens {
  display: flex;
  align-items: center;
  gap: var(--arch-space-2, 0.5rem);
}
.health-lens button {
  background: transparent;
  border: 1px solid var(--arch-color-border);
  color: var(--arch-color-fg);
  border-radius: var(--arch-radius-sm, 0.375rem);
  padding: 0.25rem 0.625rem;
  font: inherit;
  cursor: pointer;
}
.health-lens button.active {
  background: var(--arch-color-primary);
  color: var(--arch-color-primary-fg);
}
.health-lens button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
