<script setup lang="ts">
import { computed } from 'vue';
import { ArchPanel } from '@archora/ui';

const props = defineProps<{ title?: string }>();

const archProps = computed(() => ({
  padding: 'md' as const,
  scrollable: true,
  ...(props.title ? { title: props.title } : {}),
}));
</script>

<template>
  <ArchPanel v-bind="archProps">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </ArchPanel>
</template>
