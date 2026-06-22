<script setup lang="ts">
import { computed } from 'vue';
import { ArchIconButton } from '@archora/ui';
import type { FunctionalComponent, SVGAttributes } from 'vue';

const props = withDefaults(
  defineProps<{
    icon: FunctionalComponent<SVGAttributes>;
    label: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'ghost' | 'secondary';
    disabled?: boolean;
  }>(),
  { size: 'md', variant: 'ghost', disabled: false },
);

const archProps = computed(() => ({
  icon: props.icon,
  label: props.label,
  size: props.size ?? 'md',
  variant: props.variant ?? 'ghost',
  disabled: props.disabled ?? false,
}));
</script>

<template>
  <ArchIconButton v-bind="archProps" />
</template>
