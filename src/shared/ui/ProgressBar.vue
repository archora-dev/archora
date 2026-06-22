<script setup lang="ts">
import { computed } from 'vue';
import { ArchProgressBar } from '@archora/ui';

const props = withDefaults(defineProps<{ value?: number; max?: number }>(), {
  value: 0,
  max: 100,
});

const archProps = computed(() => ({
  value: props.value ?? 0,
  max: props.max ?? 100,
}));
</script>

<template>
  <ArchProgressBar v-bind="archProps" />
</template>
