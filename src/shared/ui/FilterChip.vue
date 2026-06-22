<script setup lang="ts">
import { computed } from 'vue';
import { ArchFilterChip } from '@archora/ui';

const props = defineProps<{ active?: boolean; disabled?: boolean }>();
defineEmits<{ toggle: [] }>();

const archProps = computed(() => ({
  active: props.active ?? false,
  disabled: props.disabled ?? false,
}));
</script>

<template>
  <ArchFilterChip v-bind="archProps" @toggle="$emit('toggle')">
    <slot />
  </ArchFilterChip>
</template>
