<script setup lang="ts">
import { computed } from 'vue';
import { ArchSkeleton } from '@archora/ui';

const props = withDefaults(
  defineProps<{ width?: string; height?: string; rounded?: 'sm' | 'md' | 'lg' | 'full' }>(),
  {
    width: '100%',
    height: '1em',
    rounded: 'sm',
  },
);

const circle = computed(() => props.rounded === 'full');
const archProps = computed(() => ({
  width: props.width ?? '100%',
  height: props.height ?? '1em',
  circle: circle.value,
}));
</script>

<template>
  <ArchSkeleton v-bind="archProps" />
</template>
