<script setup lang="ts">
import { computed } from 'vue';
import { ArchSelect, type ArchSelectOption } from '@archora/ui';

export interface DarkSelectOption {
  value: string | number;
  label: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: readonly DarkSelectOption[];
    full?: boolean;
    dataTest?: string;
  }>(),
  {
    full: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();

const selectOptions = computed<ArchSelectOption[]>(() =>
  props.options.map((option) => ({
    value: String(option.value),
    label: option.label,
  })),
);
const fullWidth = computed(() => props.full ?? false);
const testProps = computed(() => (props.dataTest ? { dataTest: props.dataTest } : {}));

function updateValue(value: string): void {
  const option = props.options.find((item) => String(item.value) === value);
  if (option) emit('update:modelValue', option.value);
}
</script>

<template>
  <ArchSelect
    :model-value="String(modelValue)"
    :options="selectOptions"
    :full-width="fullWidth"
    v-bind="testProps"
    @update:model-value="updateValue"
  />
</template>
