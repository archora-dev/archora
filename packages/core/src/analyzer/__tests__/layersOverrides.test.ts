import { describe, expect, it } from 'vitest';
import {
  detectLayer,
  detectLayerViolations,
  recomputeLayers,
  validateLayerOverride,
} from '../layers';
import type { DependencyEdge, ModuleNode } from '../types';

function module(id: string): ModuleNode {
  return {
    id,
    absPath: `/${id}`,
    kind: 'unknown',
    language: 'ts',
    loc: 1,
    exports: [],
    isInfra: false,
  };
}

function edge(from: string, to: string): DependencyEdge {
  return { from, to, kind: 'static', specifier: to, resolved: true };
}

describe('detectLayer with overrides', () => {
  it('promotes a path under src/lib/* into shared via glob', () => {
    expect(detectLayer('src/lib/utils.ts', { 'src/lib/**': 'shared' })).toBe('shared');
  });

  it('falls through to FSD detection when no override matches', () => {
    expect(detectLayer('src/widgets/X.vue', { 'src/lib/**': 'shared' })).toBe('widgets');
  });

  it('first matching pattern wins (insertion order)', () => {
    const overrides = {
      'src/lib/auth/**': 'features',
      'src/lib/**': 'shared',
    };
    expect(detectLayer('src/lib/auth/index.ts', overrides)).toBe('features');
    expect(detectLayer('src/lib/db.ts', overrides)).toBe('shared');
  });

  it('skips overrides with unknown layer values', () => {
    expect(detectLayer('src/lib/x.ts', { 'src/lib/**': 'bogus' })).toBe('unknown');
  });
});

describe('detectLayerViolations with overrides', () => {
  it('flags new violations introduced by promoting a path to a higher layer', () => {
    // baseline: src/lib/utils.ts is unknown, so widgets→lib doesn't violate.
    const modules = [module('src/widgets/X.vue'), module('src/lib/utils.ts')];
    const edges = [edge('src/lib/utils.ts', 'src/widgets/X.vue')];
    expect(detectLayerViolations(modules, edges)).toHaveLength(0);
    // promote lib→shared: now lib (= shared, rank 5) → widgets (rank 2) becomes a violation.
    const v = detectLayerViolations(modules, edges, { 'src/lib/**': 'shared' });
    expect(v).toHaveLength(1);
    expect(v[0]?.fromLayer).toBe('shared');
    expect(v[0]?.toLayer).toBe('widgets');
  });

  it('clears violations when overrides reclassify both endpoints', () => {
    // baseline: entities → widgets is a warning.
    const modules = [module('src/entities/order/model.ts'), module('src/widgets/order-card/X.vue')];
    const edges = [edge('src/entities/order/model.ts', 'src/widgets/order-card/X.vue')];
    expect(detectLayerViolations(modules, edges)).toHaveLength(1);
    // declare both files as `unknown`-equivalent via reclassification to widgets:
    // entities→widgets becomes widgets→widgets (same layer, allowed).
    const v = detectLayerViolations(modules, edges, {
      'src/entities/**': 'widgets',
    });
    expect(v).toHaveLength(0);
  });
});

describe('recomputeLayers', () => {
  it('returns deterministic byModule and violations', () => {
    const modules = [
      module('src/widgets/X.vue'),
      module('src/entities/order/model.ts'),
      module('src/lib/util.ts'),
    ];
    const edges = [
      edge('src/widgets/X.vue', 'src/entities/order/model.ts'),
      edge('src/entities/order/model.ts', 'src/lib/util.ts'),
    ];
    const a = recomputeLayers({ modules, edges, overrides: { 'src/lib/**': 'shared' } });
    const b = recomputeLayers({ modules, edges, overrides: { 'src/lib/**': 'shared' } });
    expect(a).toEqual(b);
    expect(a.byModule['src/lib/util.ts']).toBe('shared');
    expect(a.byModule['src/widgets/X.vue']).toBe('widgets');
    expect(a.violations).toHaveLength(0);
  });

  it('is idempotent: same input → same output', () => {
    const modules = [module('src/shared/x.ts'), module('src/pages/Home.vue')];
    const edges = [edge('src/shared/x.ts', 'src/pages/Home.vue')];
    const r1 = recomputeLayers({ modules, edges });
    const r2 = recomputeLayers({ modules, edges });
    expect(r1).toEqual(r2);
    expect(r1.violations[0]?.severity).toBe('error');
  });
});

describe('validateLayerOverride', () => {
  it('rejects empty patterns', () => {
    expect(validateLayerOverride('', 'shared')).toBe('empty');
    expect(validateLayerOverride('   ', 'shared')).toBe('empty');
  });

  it('rejects unknown layers', () => {
    expect(validateLayerOverride('src/**', 'bogus')).toBe('unknown-layer');
    expect(validateLayerOverride('src/**', 'unknown')).toBe('unknown-layer');
  });

  it('accepts a well-formed pattern + known layer', () => {
    expect(validateLayerOverride('src/lib/**', 'shared')).toBeNull();
    expect(validateLayerOverride('apps/*/src/**', 'features')).toBeNull();
  });
});
