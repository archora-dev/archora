<script setup lang="ts">
import { computed } from 'vue';
import { ArchCard } from '@archora/ui';

const props = withDefaults(defineProps<{ padded?: boolean }>(), { padded: true });

const padding = computed(() => (props.padded ? 'md' : 'none'));
</script>

<template>
  <ArchCard variant="elevated" :padding="padding">
    <slot />
  </ArchCard>
</template>
