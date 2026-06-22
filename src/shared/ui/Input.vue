<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { ArchInput } from '@archora/ui';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    type?: 'text' | 'search' | 'email' | 'password' | 'number' | 'url';
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
  }>(),
  { type: 'text', disabled: false, invalid: false },
);

defineEmits<{ 'update:modelValue': [value: string] }>();

const inputRef = ref<ComponentPublicInstance | null>(null);
const archProps = computed(() => ({
  modelValue: props.modelValue ?? '',
  type: props.type ?? 'text',
  disabled: props.disabled ?? false,
  invalid: props.invalid ?? false,
  ...(props.placeholder ? { placeholder: props.placeholder } : {}),
}));

defineExpose({
  focus: (opts?: FocusOptions) => {
    const input = inputRef.value?.$el as HTMLInputElement | undefined;
    input?.focus(opts);
  },
  select: () => {
    const input = inputRef.value?.$el as HTMLInputElement | undefined;
    input?.select();
  },
});
</script>

<template>
  <ArchInput
    ref="inputRef"
    v-bind="archProps"
    @update:model-value="$emit('update:modelValue', String($event))"
  />
</template>
