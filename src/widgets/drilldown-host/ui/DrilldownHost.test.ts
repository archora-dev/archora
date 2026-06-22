import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { useScanStore } from '@/entities/scan';
import { useDrilldownStore } from '@/features/cockpit-view';
import DrilldownHost from './DrilldownHost.vue';

// Stub ArchDrawer to render the default slot inline (avoids Teleport to body)
const ArchDrawerStub = defineComponent({
  name: 'ArchDrawer',
  props: { open: Boolean },
  setup(props, { slots }) {
    return () => (props.open && slots.default ? h('div', slots.default()) : null);
  },
});

const scan = {
  project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
  modules: [
    {
      id: 'src/a.ts',
      absPath: '/a',
      kind: 'module',
      language: 'ts',
      loc: 1,
      exports: [],
      isInfra: false,
    },
  ],
  edges: [],
  cycles: [],
  metrics: {},
  hotZones: ['src/a.ts'],
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
};

describe('DrilldownHost', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders nothing when no surface is open', () => {
    useScanStore().complete(scan as never);
    const w = mount(DrilldownHost, {
      global: { stubs: { ArchDrawer: ArchDrawerStub } },
    });
    expect(w.find('[data-test="drilldown-host"]').exists()).toBe(false);
  });

  it('renders the active surface when one is opened', async () => {
    useScanStore().complete(scan as never);
    const drill = useDrilldownStore();
    const w = mount(DrilldownHost, {
      global: { stubs: { ArchDrawer: ArchDrawerStub } },
    });
    drill.open('scan-info');
    await w.vm.$nextTick();
    expect(w.find('[data-test="scan-info-surface"]').exists()).toBe(true);
  });
});
