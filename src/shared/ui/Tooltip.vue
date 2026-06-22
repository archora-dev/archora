<script setup lang="ts">
import { computed } from 'vue';
import { ArchTooltip } from '@archora/ui';

const props = defineProps<{
  content?: string;
  label?: string;
  wide?: boolean;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}>();

const text = computed(() => props.content ?? props.label ?? '');
const archProps = computed(() => ({
  content: text.value,
  ...(props.placement ? { placement: props.placement } : {}),
}));
</script>

<template>
  <ArchTooltip v-bind="archProps">
    <slot />
  </ArchTooltip>
</template>
