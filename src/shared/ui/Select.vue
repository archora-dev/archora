<script setup lang="ts" generic="T extends string | number">
import { computed } from 'vue';
import { ArchSelect } from '@archora/ui';

interface Option<V> {
  value: V;
  label: string;
}

const props = defineProps<{
  modelValue: T;
  options: Option<T>[];
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const archOptions = computed(() =>
  props.options.map((option) => ({
    value: String(option.value),
    label: option.label,
  })),
);
const archProps = computed(() => ({
  modelValue: String(props.modelValue),
  options: archOptions.value,
  disabled: props.disabled ?? false,
}));

function updateValue(value: string): void {
  const match = props.options.find((option) => String(option.value) === value);
  if (match) emit('update:modelValue', match.value);
}
</script>

<template>
  <ArchSelect v-bind="archProps" @update:model-value="updateValue" />
</template>
