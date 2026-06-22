<script setup lang="ts">
import { ArchDropdownItem } from '@archora/ui';

defineProps<{ items: Array<{ label: string; value: string; disabled?: boolean }> }>();
const emit = defineEmits<{ select: [value: string] }>();
</script>

<template>
  <ArchDropdownItem
    v-for="item in items"
    :key="item.value"
    :value="item.value"
    :disabled="item.disabled ?? false"
    @click="emit('select', item.value)"
  >
    {{ item.label }}
  </ArchDropdownItem>
</template>
