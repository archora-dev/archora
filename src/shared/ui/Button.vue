<script setup lang="ts">
import { computed } from 'vue';
import { ArchButton } from '@archora/ui';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    fullWidth: false,
  },
);

const archProps = computed(() => ({
  variant: props.variant ?? 'secondary',
  size: props.size ?? 'md',
  type: props.type ?? 'button',
  disabled: props.disabled ?? false,
  loading: props.loading ?? false,
  block: props.fullWidth ?? false,
}));
</script>

<template>
  <ArchButton v-bind="archProps">
    <slot />
  </ArchButton>
</template>
