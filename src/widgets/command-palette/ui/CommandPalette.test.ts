import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useScanStore } from '@/entities/scan';
import { useDrilldownStore } from '@/features/cockpit-view';
import { OPEN_SEARCH_EVENT } from '@/shared/lib';
import CommandPalette from './CommandPalette.vue';

function completedScan() {
  useScanStore().complete({
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: 't',
    durationMs: 1,
    warnings: [],
  });
}

describe('CommandPalette', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('opens on OPEN_SEARCH_EVENT and lists surface commands', async () => {
    completedScan();
    const w = mount(CommandPalette);
    window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
    await w.vm.$nextTick();
    expect(w.find('[data-test="command-palette"]').exists()).toBe(true);
  });

  it('opens a surface in the drill-down store when an item is chosen', () => {
    completedScan();
    const drill = useDrilldownStore();
    const w = mount(CommandPalette);
    (w.vm as unknown as { choose: (value: string) => void }).choose('surface:explorer');
    expect(drill.surface).toBe('explorer');
  });
});
