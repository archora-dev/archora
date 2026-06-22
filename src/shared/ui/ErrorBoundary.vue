<script setup lang="ts">
import { ArchErrorBoundary } from '@archora/ui';

const props = defineProps<{ fallbackTitle?: string }>();
</script>

<template>
  <ArchErrorBoundary
    :fallback-title="props.fallbackTitle ?? 'Something went wrong'"
    retry-label="Try again"
  >
    <slot />
  </ArchErrorBoundary>
</template>
