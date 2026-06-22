<script setup lang="ts">
import { computed } from 'vue';
import { ArchSpinner } from '@archora/ui';

const props = withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg'; label?: string }>(), {
  size: 'md',
  label: 'Loading',
});

const archProps = computed(() => ({
  size: props.size ?? 'md',
  label: props.label ?? 'Loading',
}));
</script>

<template>
  <ArchSpinner v-bind="archProps" />
</template>
