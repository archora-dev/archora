<script setup lang="ts">
import { ArchKbd } from '@archora/ui';

defineProps<{ keys: string[] }>();
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <ArchKbd v-for="(key, index) in keys" :key="`${key}-${index}`" size="sm" variant="outline">
      {{ key }}
    </ArchKbd>
  </span>
</template>
