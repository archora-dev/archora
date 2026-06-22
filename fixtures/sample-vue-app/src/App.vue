<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';
</script>

<template>
  <AppHeader />
  <AppSidebar />
  <RouterView />
</template>
