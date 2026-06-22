<script setup lang="ts" generic="T">
import { computed, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { ArchVirtualScroller } from '@archora/ui';

interface Props<U> {
  items: readonly U[];
  itemHeight: number;
  height?: number | string;
  overscan?: number;
  keyFn?: (item: U, index: number) => string | number;
}

const props = withDefaults(defineProps<Props<T>>(), {
  height: '100%',
  overscan: 5,
  keyFn: ((_: unknown, index: number) => index) as never,
});

defineSlots<{
  default(props: { item: T; index: number }): unknown;
}>();

const scrollerRef = ref<ComponentPublicInstance<{ scrollTo: (index: number) => void }> | null>(
  null,
);
const archProps = computed(() => ({
  items: props.items,
  itemHeight: props.itemHeight,
  height: props.height ?? '100%',
  overscan: props.overscan ?? 5,
  keyFn: props.keyFn ?? ((_: T, index: number) => index),
}));

defineExpose({
  scrollTo(index: number): void {
    scrollerRef.value?.scrollTo(index);
  },
});
</script>

<template>
  <ArchVirtualScroller ref="scrollerRef" v-bind="archProps">
    <template #default="{ item, index }">
      <slot :item="item as T" :index="index" />
    </template>
  </ArchVirtualScroller>
</template>
