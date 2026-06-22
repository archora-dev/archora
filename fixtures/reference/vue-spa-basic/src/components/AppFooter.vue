<script setup lang="ts">
import { cn } from '@/utils/cn';
</script>

<template>
  <footer :class="cn('app-footer', 'border-t')">
    <span>© {{ new Date().getFullYear() }}</span>
  </footer>
</template>
