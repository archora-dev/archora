<script setup lang="ts">
import { computed } from 'vue';
import { ArchStatusState } from '@archora/ui';
import type { FunctionalComponent, SVGAttributes } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'loading' | 'empty' | 'error' | 'no-results';
    title: string;
    description?: string;
    icon?: FunctionalComponent<SVGAttributes>;
  }>(),
  { variant: 'empty' },
);

const archProps = computed(() => ({
  variant: props.variant ?? 'empty',
  title: props.title,
  ...(props.description ? { description: props.description } : {}),
}));
</script>

<template>
  <ArchStatusState v-bind="archProps">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </ArchStatusState>
</template>
