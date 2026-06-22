import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { ScanResult } from '@/core/analyzer/types';
import ScanInfoSurface from './ScanInfoSurface.vue';

const scan: ScanResult = {
  project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
  modules: [
    {
      id: 'src/a.ts',
      absPath: '/a',
      kind: 'module',
      language: 'ts',
      loc: 10,
      exports: [],
      isInfra: false,
    },
    {
      id: 'src/b.ts',
      absPath: '/b',
      kind: 'module',
      language: 'ts',
      loc: 10,
      exports: [],
      isInfra: false,
    },
  ],
  edges: [{ from: 'src/a.ts', to: 'src/b.ts', kind: 'static', specifier: './b', resolved: true }],
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
};

describe('ScanInfoSurface', () => {
  it('renders without throwing', () => {
    const w = mount(ScanInfoSurface, { props: { scan } });
    expect(w.find('[data-test="scan-info-surface"]').exists()).toBe(true);
  });
});
