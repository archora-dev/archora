import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { ScanResult } from '@/core/analyzer/types';
import ExplorerSurface from './ExplorerSurface.vue';

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
  edges: [
    { from: 'src/a.ts', to: 'src/b.ts', kind: 'static', specifier: './b', resolved: true },
    { from: 'src/b.ts', to: 'src/a.ts', kind: 'static', specifier: './a', resolved: true },
  ],
  cycles: [{ id: 'cycle:1', modules: ['src/a.ts', 'src/b.ts'], length: 2, severity: 'direct' }],
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

describe('ExplorerSurface', () => {
  it('renders the folder tree from the builder', () => {
    const w = mount(ExplorerSurface, { props: { scan } });
    expect(w.find('[data-test="explorer-surface"]').exists()).toBe(true);
    expect(w.text()).toContain('src');
  });

  it('renders module files as leaves and flags those in a cycle', () => {
    const w = mount(ExplorerSurface, { props: { scan } });
    const text = w.text();
    expect(text).toContain('a.ts');
    expect(text).toContain('b.ts');
    expect(text).toContain('cycle');
  });
});
