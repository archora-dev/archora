<script setup lang="ts">
import { computed } from 'vue';
import { ArchSeverityMarker } from '@archora/ui';

type Severity = 'low' | 'medium' | 'high' | 'critical' | 'info' | 'success' | 'neutral' | 'unknown';

const props = withDefaults(
  defineProps<{
    severity: Severity;
    size?: 'xs' | 'sm' | 'md';
    label?: string;
  }>(),
  { size: 'sm' },
);

const archProps = computed(() => ({
  severity: props.severity,
  size: props.size ?? 'sm',
  ...(props.label ? { label: props.label } : {}),
}));
</script>

<template>
  <ArchSeverityMarker v-bind="archProps" />
</template>
