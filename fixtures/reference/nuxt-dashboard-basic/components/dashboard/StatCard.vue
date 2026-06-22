<script setup lang="ts">
defineProps<{ label: string; value: string }>();
</script>

<template>
  <article class="stat-card">
    <span class="stat-card__label">{{ label }}</span>
    <strong class="stat-card__value">{{ value }}</strong>
  </article>
</template>
