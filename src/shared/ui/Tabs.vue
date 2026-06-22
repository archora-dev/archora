<script setup lang="ts" generic="T extends string">
import { ArchTabs } from '@archora/ui';

interface Tab<V> {
  value: V;
  label: string;
}

defineProps<{ modelValue: T; tabs: Tab<T>[] }>();
defineEmits<{ 'update:modelValue': [value: T] }>();
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <ArchTabs
      :model-value="modelValue"
      :items="tabs"
      @update:model-value="$emit('update:modelValue', $event as T)"
    />
    <div role="tabpanel" class="flex min-h-0 min-w-0 flex-1 flex-col">
      <slot :active="modelValue" />
    </div>
  </div>
</template>
