<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { ArchSearchInput } from '@archora/ui';

const props = withDefaults(
  defineProps<{ modelValue?: string; placeholder?: string; disabled?: boolean }>(),
  { modelValue: '', placeholder: '', disabled: false },
);

defineEmits<{ 'update:modelValue': [value: string] }>();

const searchRef = ref<ComponentPublicInstance<{ focus: () => void }> | null>(null);
const archProps = computed(() => ({
  modelValue: props.modelValue ?? '',
  disabled: props.disabled ?? false,
  ...(props.placeholder ? { placeholder: props.placeholder } : {}),
}));

function focus(): void {
  searchRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <ArchSearchInput
    ref="searchRef"
    v-bind="archProps"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
