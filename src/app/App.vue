<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '@/app/layouts/AppShell.vue';
import { LicenseGate } from '@/features/license-activation';
import { ToastHost } from '@/shared/ui';
import { markStartup } from '@/shared/lib/startupTiming';

markStartup('App.vue setup');
onMounted(() => markStartup('App.vue mounted'));
</script>

<template>
  <LicenseGate>
    <AppShell />
  </LicenseGate>
  <ToastHost />
</template>
