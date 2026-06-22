<script setup lang="ts" generic="T">
import { computed } from 'vue';
import { ArchBadgeGroup } from '@archora/ui';

interface Props<U> {
  items: readonly U[];
  limit?: number;
  gap?: 'xs' | 'sm';
  keyFn?: (item: U, index: number) => string | number;
}

const props = withDefaults(defineProps<Props<T>>(), {
  limit: 2,
  gap: 'sm',
  keyFn: ((_: unknown, index: number) => index) as never,
});

defineSlots<{
  default(props: { item: T; index: number }): unknown;
}>();

const archProps = computed(() => ({
  items: props.items,
  limit: props.limit ?? 2,
  gap: props.gap ?? 'sm',
  keyFn: props.keyFn ?? ((_: T, index: number) => index),
}));
</script>

<template>
  <ArchBadgeGroup v-bind="archProps">
    <template #default="{ item, index }">
      <slot :item="item as T" :index="index" />
    </template>
  </ArchBadgeGroup>
</template>
