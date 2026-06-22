<script setup lang="ts">
import { computed } from 'vue';
import { ArchEmptyState } from '@archora/ui';
import type { FunctionalComponent, SVGAttributes } from 'vue';

const props = defineProps<{
  icon?: FunctionalComponent<SVGAttributes>;
  title: string;
  description?: string;
}>();

const archProps = computed(() => ({
  title: props.title,
  variant: 'outlined' as const,
  ...(props.description ? { description: props.description } : {}),
}));
</script>

<template>
  <ArchEmptyState v-bind="archProps">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </ArchEmptyState>
</template>
