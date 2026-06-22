<script setup lang="ts">
import { computed } from 'vue';
import { ArchSwitch } from '@archora/ui';

const props = withDefaults(
  defineProps<{ modelValue?: boolean; disabled?: boolean; label?: string }>(),
  { modelValue: false, disabled: false },
);

defineEmits<{ 'update:modelValue': [value: boolean] }>();

const archProps = computed(() => ({
  modelValue: props.modelValue ?? false,
  disabled: props.disabled ?? false,
  ariaLabel: props.label ?? '',
  ...(props.label ? { label: props.label } : {}),
}));
</script>

<template>
  <ArchSwitch
    v-bind="archProps"
    :aria-checked="String(props.modelValue ?? false)"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
