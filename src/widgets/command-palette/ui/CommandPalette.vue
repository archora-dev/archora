<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ArchCommand } from '@archora/ui';
import { useScanStore } from '@/entities/scan';
import { useDrilldownStore, type DrilldownSurface } from '@/features/cockpit-view';
import { OPEN_SEARCH_EVENT } from '@/shared/lib';
import { buildCommandItems } from '../model/buildCommandItems';

const scan = useScanStore();
const drill = useDrilldownStore();
const open = ref(false);

const surfaceLabels: Record<DrilldownSurface, string> = {
  explorer: 'Explorer',
  impact: 'Impact',
  rules: 'Rules',
  'scan-info': 'Scan info',
  'change-risk': 'Change risk',
  'dead-code': 'Dead code',
  ownership: 'Area risk',
};

const items = computed(() => buildCommandItems(scan.result, { surfaces: surfaceLabels }));

function choose(value: string): void {
  const item = items.value.find((i) => i.value === value);
  if (!item) return;
  if (item.action.kind === 'surface') drill.open(item.action.surface);
  else drill.open('impact', item.action.moduleId);
  open.value = false;
}

function onOpen(): void {
  open.value = true;
}
onMounted(() => window.addEventListener(OPEN_SEARCH_EVENT, onOpen));
onUnmounted(() => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen));

defineExpose({ choose });
</script>

<template>
  <div v-if="open" class="command-overlay" data-test="command-palette" @click.self="open = false">
    <div class="command-box">
      <ArchCommand
        :items="items"
        placeholder="Search surfaces and modules…"
        empty-text="No matches. Open a project to search its modules."
        @update:model-value="choose"
      />
    </div>
  </div>
</template>

<style scoped>
.command-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  z-index: 60;
}
.command-box {
  width: min(640px, 92vw);
  max-height: 70vh;
  background: var(--arch-color-surface);
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-md, 0.5rem);
  overflow-x: hidden;
  overflow-y: auto;
}
.command-box :deep(*) {
  min-width: 0;
}
.command-box :deep([class*='item']) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
