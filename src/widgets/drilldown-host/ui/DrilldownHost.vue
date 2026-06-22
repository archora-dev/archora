<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import { ArchDrawer } from '@archora/ui';
import { useScanStore } from '@/entities/scan';
import { useDrilldownStore } from '@/features/cockpit-view';
import { ExplorerSurface } from '@/widgets/explorer';
import { ImpactSurface } from '@/widgets/impact';
import { ScanInfoSurface } from '@/widgets/scan-info';
import { RulesSurface } from '@/widgets/rules-editor';
import { ChangeRiskSurface } from '@/widgets/change-risk';
import { DeadCodeSurface } from '@/widgets/dead-code';
import { OwnershipSurface } from '@/widgets/ownership';

const scan = useScanStore();
const drill = useDrilldownStore();

const surfaceTitles: Record<string, string> = {
  explorer: 'Explorer',
  impact: 'Impact',
  rules: 'Rules',
  'scan-info': 'Scan info',
  'change-risk': 'Change risk',
  'dead-code': 'Dead code',
  ownership: 'Area risk',
};

const drilldownTitle = computed(() =>
  drill.surface ? (surfaceTitles[drill.surface] ?? drill.surface) : '',
);

const surfaceComponent = computed(() => {
  switch (drill.surface) {
    case 'explorer':
      return ExplorerSurface;
    case 'impact':
      return ImpactSurface;
    case 'scan-info':
      return ScanInfoSurface;
    case 'rules':
      return RulesSurface;
    case 'change-risk':
      return ChangeRiskSurface;
    case 'dead-code':
      return DeadCodeSurface;
    case 'ownership':
      return OwnershipSurface;
    default:
      return null;
  }
});
</script>

<template>
  <ArchDrawer
    v-if="surfaceComponent && scan.result"
    :open="true"
    side="right"
    size="lg"
    :title="drilldownTitle"
    @update:open="
      (v) => {
        if (!v) drill.close();
      }
    "
  >
    <div data-test="drilldown-host">
      <button
        v-if="drill.canGoBack"
        type="button"
        class="drilldown-back"
        data-test="drilldown-back"
        @click="drill.back()"
      >
        <ArrowLeft :size="15" />
        <span>Back</span>
      </button>
      <Transition name="surface-swap" mode="out-in">
        <component
          :is="surfaceComponent"
          :key="drill.surface ?? ''"
          :scan="scan.result"
          :focused-module="drill.focusedModule"
        />
      </Transition>
    </div>
  </ArchDrawer>
</template>

<style scoped>
.drilldown-back {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.85rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--motion-fast),
    border-color var(--motion-fast),
    background-color var(--motion-fast);
}

.drilldown-back:hover {
  color: var(--color-text);
  border-color: rgb(124 109 255 / 0.4);
}

/* Cross-fade when the active surface changes */
.surface-swap-enter-active {
  transition:
    opacity 160ms ease-out,
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.surface-swap-leave-active {
  transition:
    opacity 120ms ease-in,
    transform 120ms ease-in;
}
.surface-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.surface-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
