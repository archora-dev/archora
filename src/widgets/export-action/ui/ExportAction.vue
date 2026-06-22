<script setup lang="ts">
import { Button } from '@/shared/ui';
import { useToast } from '@/shared/ui';
import { saveReport } from '@/features/export-report';
import type { ScanResult } from '@/core/analyzer/types';

const props = defineProps<{ scan: ScanResult }>();
const toast = useToast();

async function exportReport(
  format: 'json' | 'html',
  scope: 'full' | 'fix-plan' = 'full',
): Promise<void> {
  try {
    const out = await saveReport({ scan: props.scan, format, scope });
    toast.show({ title: `Saved ${out.fileName}` });
  } catch (err) {
    if ((err as Error)?.name === 'SaveReportCancelledError') return;
    toast.show({ title: 'Export failed' });
  }
}
</script>

<template>
  <div class="export-action" data-test="export-action">
    <Button size="sm" variant="secondary" data-test="export-json" @click="exportReport('json')">
      Export JSON
    </Button>
    <Button size="sm" variant="secondary" data-test="export-html" @click="exportReport('html')">
      Export HTML
    </Button>
    <Button
      size="sm"
      variant="ghost"
      data-test="export-fixplan"
      @click="exportReport('html', 'fix-plan')"
    >
      Fix plan
    </Button>
  </div>
</template>

<style scoped>
.export-action {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--arch-space-2, 0.5rem);
  padding: var(--arch-space-2, 0.5rem) var(--arch-space-4, 1rem);
  border-bottom: 1px solid var(--arch-color-border);
}
</style>
