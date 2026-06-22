<script setup lang="ts">
import { ArchIcon } from '@archora/ui';
import type { FunctionalComponent, SVGAttributes } from 'vue';

defineProps<{
  icon: FunctionalComponent<SVGAttributes>;
  size?: number;
}>();
</script>

<template>
  <ArchIcon :icon="icon" :size="size ?? 16" :stroke-width="1.75" />
</template>
