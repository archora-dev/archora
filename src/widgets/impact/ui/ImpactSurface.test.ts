import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { ScanResult } from '@/core/analyzer/types';
import ImpactSurface from './ImpactSurface.vue';

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

describe('ImpactSurface', () => {
  it('renders without throwing', () => {
    const w = mount(ImpactSurface, {
      props: { scan, focusedModule: 'src/a.ts' },
    });
    expect(w.find('[data-test="impact-surface"]').exists()).toBe(true);
  });

  it('renders dependents section label when module has incomers', () => {
    // src/b.ts is imported by src/a.ts, so it has an incomer (src/a.ts is a dependent)
    const w = mount(ImpactSurface, {
      props: { scan, focusedModule: 'src/b.ts' },
    });
    expect(w.text()).toContain('Depended on by (blast radius)');
  });

  it('renders only "Depends on" section for a module that imports but is not imported', () => {
    // src/a.ts imports src/b.ts but nothing imports src/a.ts
    // dependentRows (incomingImporters) is empty → that section is hidden
    const w = mount(ImpactSurface, {
      props: { scan, focusedModule: 'src/a.ts' },
    });
    expect(w.text()).toContain('Depends on');
    expect(w.text()).not.toContain('Depended on by (blast radius)');
  });

  it('renders only "Depended on by" section for a module that is imported but imports nothing', () => {
    // src/b.ts is imported by src/a.ts but has no outgoing imports
    // dependencyRows (outgoingImports) is empty → that section is hidden
    const w = mount(ImpactSurface, {
      props: { scan, focusedModule: 'src/b.ts' },
    });
    expect(w.text()).toContain('Depended on by (blast radius)');
    expect(w.text()).not.toContain('Depends on');
  });

  it('shows incomingImporters section for src/b.ts (src/a.ts depends on it)', () => {
    // src/a.ts → src/b.ts means src/a.ts is a dependent of src/b.ts
    const w = mount(ImpactSurface, {
      props: { scan, focusedModule: 'src/b.ts' },
    });
    const text = w.text();
    expect(text).toContain('Depended on by (blast radius)');
    // src/a.ts appears as a dependent of src/b.ts (label may be shortened by buildImpactViewModel)
    expect(text).toContain('a.ts');
  });
});
