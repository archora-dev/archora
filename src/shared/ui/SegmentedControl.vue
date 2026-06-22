<script setup lang="ts" generic="T extends string">
import { computed } from 'vue';
import { ArchSegmentedControl } from '@archora/ui';

interface Option<V> {
  value: V;
  label: string;
}

const props = defineProps<{ modelValue: T; options: Option<T>[]; disabled?: boolean }>();
defineEmits<{ 'update:modelValue': [value: T] }>();

const archProps = computed(() => ({
  modelValue: props.modelValue,
  options: props.options,
  disabled: props.disabled ?? false,
  size: 'sm' as const,
}));
</script>

<template>
  <ArchSegmentedControl
    v-bind="archProps"
    @update:model-value="$emit('update:modelValue', $event as T)"
  />
</template>
