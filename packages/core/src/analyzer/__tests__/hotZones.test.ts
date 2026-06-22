import { describe, expect, it } from 'vitest';
import { markBarrelModules, rankHotZones } from '../hotZones';
import type { ModuleMetrics, ModuleNode, ParsedFileSummary } from '../types';

function module(id: string, overrides: Partial<ModuleNode> = {}): ModuleNode {
  return {
    id,
    absPath: `/${id}`,
    kind: 'unknown',
    language: 'ts',
    loc: 1,
    exports: [],
    isInfra: false,
    ...overrides,
  };
}

function metrics(overrides: Partial<ModuleMetrics> = {}): ModuleMetrics {
  return {
    fanIn: 0,
    fanOut: 0,
    instability: 0,
    depth: 0,
    inCycle: false,
    couplingScore: 0,
    hotnessScore: 0,
    ...overrides,
  };
}

function summary(relPath: string, overrides: Partial<ParsedFileSummary> = {}): ParsedFileSummary {
  return {
    relPath,
    language: 'ts',
    loc: 1,
    imports: [],
    exports: [],
    runtimeFacts: [],
    frameworkFacts: [],
    routeFacts: [],
    stateFacts: [],
    assetFacts: [],
    limitations: [],
    ...overrides,
  };
}

describe('markBarrelModules', () => {
  it('flags a thin index barrel with fan-out >= 3 even when no export source is enumerated', () => {
    // Pinia `packages/pinia/src/index.ts`: fan-out 8, 66 named re-exports the
    // parser couldn't resolve a source for, ~70 loc — thin glue.
    const modules = [
      module('packages/pinia/src/index.ts', {
        loc: 70,
        exports: Array.from({ length: 66 }, (_, i) => `reexport${i}`),
      }),
    ];
    const m = { 'packages/pinia/src/index.ts': metrics({ fanOut: 8 }) };
    markBarrelModules({
      modules,
      metrics: m,
      parserFacts: [summary('packages/pinia/src/index.ts', { loc: 70 })],
    });
    expect(modules[0]?.isBarrel).toBe(true);
  });

  it('flags a mid/small package barrel below the old fan-out fallback', () => {
    // VueUse `packages/math/index.ts`: fan-out 18, ~20 loc.
    const modules = [module('packages/math/index.ts', { loc: 20 })];
    const m = { 'packages/math/index.ts': metrics({ fanOut: 18 }) };
    markBarrelModules({ modules, metrics: m, parserFacts: [] });
    expect(modules[0]?.isBarrel).toBe(true);
  });

  it('does not flag a fat module with many source lines per export', () => {
    // VueUse `useStorage/index.ts`: loc 328, surface 7 → 46 loc/item.
    const modules = [module('packages/core/useStorage/index.ts', { loc: 328 })];
    const m = { 'packages/core/useStorage/index.ts': metrics({ fanOut: 5 }) };
    markBarrelModules({
      modules,
      metrics: m,
      parserFacts: [summary('packages/core/useStorage/index.ts', { loc: 328 })],
    });
    expect(modules[0]?.isBarrel).toBeUndefined();
  });

  it('does not flag a fan-out-0 multi-export util that re-exports nothing', () => {
    // VueUse `shared/utils/is.ts`: fan-out 0, 13 own exports — a leaf, not glue.
    const modules = [
      module('packages/shared/utils/is.ts', {
        loc: 30,
        exports: Array.from({ length: 13 }, (_, i) => `is${i}`),
      }),
    ];
    const m = { 'packages/shared/utils/is.ts': metrics({ fanOut: 0 }) };
    markBarrelModules({ modules, metrics: m, parserFacts: [] });
    expect(modules[0]?.isBarrel).toBeUndefined();
  });

  it('does not flag a thin module whose surface is below the floor', () => {
    // Two imports, two re-exports: not an aggregation surface.
    const modules = [module('src/glue.ts', { loc: 3 })];
    const m = { 'src/glue.ts': metrics({ fanOut: 3 }) };
    markBarrelModules({ modules, metrics: m, parserFacts: [] });
    expect(modules[0]?.isBarrel).toBeUndefined();
  });
});

describe('rankHotZones', () => {
  it('drops barrels from the ranked window without backfilling lower-signal modules', () => {
    const modules = [module('barrel/index.ts', { isBarrel: true }), module('a.ts'), module('b.ts')];
    const m = {
      'barrel/index.ts': metrics({ hotnessScore: 5 }),
      'a.ts': metrics({ hotnessScore: 3 }),
      'b.ts': metrics({ hotnessScore: 1 }),
    };
    expect(rankHotZones({ modules, metrics: m, topN: 2 })).toEqual(['a.ts']);
  });

  it('excludes infra modules', () => {
    const modules = [module('infra.ts', { isInfra: true }), module('app.ts')];
    const m = {
      'infra.ts': metrics({ hotnessScore: 9 }),
      'app.ts': metrics({ hotnessScore: 2 }),
    };
    expect(rankHotZones({ modules, metrics: m })).toEqual(['app.ts']);
  });
});
