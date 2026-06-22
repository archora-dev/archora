<script setup lang="ts">
import { computed } from 'vue';
import { ArchTextarea } from '@archora/ui';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    invalid?: boolean;
  }>(),
  { rows: 4, disabled: false, invalid: false },
);

defineEmits<{ 'update:modelValue': [value: string] }>();

const archProps = computed(() => ({
  modelValue: props.modelValue ?? '',
  disabled: props.disabled ?? false,
  rows: props.rows ?? 4,
  invalid: props.invalid ?? false,
  ...(props.placeholder ? { placeholder: props.placeholder } : {}),
}));
</script>

<template>
  <ArchTextarea v-bind="archProps" @update:model-value="$emit('update:modelValue', $event)" />
</template>
