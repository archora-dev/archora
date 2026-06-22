<script setup lang="ts">
import { ArchActiveFilters } from '@archora/ui';

export interface ActiveFilter {
  id: string;
  label: string;
  value?: string;
}

const props = defineProps<{ filters: readonly ActiveFilter[] }>();
defineEmits<{ remove: [id: string]; reset: [] }>();
</script>

<template>
  <ArchActiveFilters
    :filters="props.filters"
    @remove="$emit('remove', $event)"
    @reset="$emit('reset')"
  />
</template>
