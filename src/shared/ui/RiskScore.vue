<script setup lang="ts">
import { computed } from 'vue';
import { ArchSeverityMarker } from '@archora/ui';

type Severity = 'low' | 'medium' | 'high' | 'critical' | 'info' | 'unknown';

const props = withDefaults(
  defineProps<{
    score?: number | null;
    severity: Severity;
    reason?: string;
    size?: 'sm' | 'md' | 'lg';
    layout?: 'inline' | 'block';
  }>(),
  { size: 'sm', layout: 'inline' },
);

const severityLabels: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
  unknown: 'Not set',
};

const label = computed(() => severityLabels[props.severity]);

const scoreText = computed(() => {
  if (props.score === null || props.score === undefined) return null;
  if (Number.isNaN(props.score)) return null;
  return Math.round(props.score).toString();
});

const sizeClass = computed(() => {
  switch (props.size ?? 'sm') {
    case 'lg':
      return 'text-md';
    case 'md':
      return 'text-sm';
    default:
      return 'text-xs';
  }
});
</script>

<template>
  <div
    class="inline-flex items-start gap-1.5"
    :class="(props.layout ?? 'inline') === 'block' ? 'flex-col' : 'flex-row items-center'"
  >
    <span class="inline-flex items-center gap-1.5" :class="sizeClass">
      <ArchSeverityMarker
        :severity="severity"
        :label="label"
        :size="(props.size ?? 'sm') === 'lg' ? 'md' : 'sm'"
      />
      <span v-if="scoreText !== null" class="font-mono font-semibold tabular-nums text-text">
        {{ scoreText }}
      </span>
      <span class="font-medium text-text-muted">{{ label }}</span>
    </span>
    <span
      v-if="props.reason"
      class="text-xs text-text-muted"
      :class="(props.layout ?? 'inline') === 'block' ? '' : 'ml-1'"
    >
      <span class="text-text-subtle">Why:</span>
      {{ props.reason }}
    </span>
  </div>
</template>
