<script setup lang="ts">
import { computed } from 'vue';
import { ArchStat } from '@archora/ui';
import type { ScanResult } from '@/core/analyzer/types';
import { buildScanInfo } from '../model/buildScanInfo';

const props = defineProps<{ scan: ScanResult; focusedModule?: string | null }>();

const info = computed(() => buildScanInfo(props.scan));
</script>

<template>
  <section data-test="scan-info-surface">
    <ArchStat label="Grade" :value="info.grade" />
    <ArchStat label="Debt" :value="info.debtScore" />
    <ArchStat label="Modules" :value="info.moduleCount" />
    <ArchStat label="Edges" :value="info.edgeCount" />
    <ArchStat label="Warnings" :value="info.warningCount" />
    <ArchStat label="Duration (ms)" :value="info.durationMs" />
    <ArchStat label="Config" :value="info.configState" />
    <ArchStat label="Signals" :value="info.signalCount" />
    <ArchStat label="Recommendations" :value="info.recommendationCount" />
  </section>
</template>
