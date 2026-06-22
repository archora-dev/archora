<script setup lang="ts">
import { computed } from 'vue';
import { ArchBadge } from '@archora/ui';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
type Severity = 'low' | 'medium' | 'high' | 'critical' | 'info' | 'unknown';
type Variant = 'soft' | 'solid' | 'outline';

const props = withDefaults(
  defineProps<{
    tone?: Tone;
    severity?: Severity;
    variant?: Variant;
    size?: 'sm' | 'md';
    count?: number;
    srOnly?: boolean;
  }>(),
  { variant: 'soft', size: 'sm' },
);

const resolvedTone = computed<Tone>(() => {
  if (props.tone) return props.tone;
  switch (props.severity) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
    case 'info':
      return 'info';
    case 'low':
      return 'success';
    default:
      return 'neutral';
  }
});

const badgeClass = computed(() => (props.srOnly ? 'sr-only' : ''));
</script>

<template>
  <ArchBadge :variant="resolvedTone" :size="props.size ?? 'sm'" :class="badgeClass">
    <template v-if="typeof count === 'number'">+{{ count }}</template>
    <slot v-else />
  </ArchBadge>
</template>
