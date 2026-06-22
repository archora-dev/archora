<script setup lang="ts">
import { computed } from 'vue';
import { ArchCheckbox } from '@archora/ui';

const props = withDefaults(
  defineProps<{ modelValue?: boolean; disabled?: boolean; label?: string }>(),
  { modelValue: false, disabled: false },
);

defineEmits<{ 'update:modelValue': [value: boolean] }>();

const archProps = computed(() => ({
  modelValue: props.modelValue ?? false,
  disabled: props.disabled ?? false,
  ...(props.label ? { label: props.label } : {}),
}));
</script>

<template>
  <ArchCheckbox v-bind="archProps" @update:model-value="$emit('update:modelValue', $event)">
    <slot />
  </ArchCheckbox>
</template>
