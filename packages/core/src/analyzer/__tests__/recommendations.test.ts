import { describe, expect, it } from 'vitest';
import { computeRecommendations } from '../recommendations';
import type { Cycle, DependencyEdge, ModuleMetrics, ModuleNode } from '../types';
import type { TemporalCoupling } from '../../git/types';

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

function edge(from: string, to: string, kind: DependencyEdge['kind'] = 'static'): DependencyEdge {
  return { from, to, kind, specifier: to, resolved: true };
}

describe('computeRecommendations', () => {
  it('flags an unused utility', () => {
    const modules = [module('src/shared/lib/dead.ts', { kind: 'util' })];
    const recs = computeRecommendations({
      modules,
      edges: [],
      metrics: { 'src/shared/lib/dead.ts': metrics({ fanIn: 0 }) },
      cycles: [],
      layerViolations: [],
      hotZones: [],
    });
    expect(recs.some((r) => r.kind === 'unused-utility')).toBe(true);
  });

  it('proposes a cycle break candidate', () => {
    const modules = [module('a.ts'), module('b.ts')];
    const cycle: Cycle = { id: 'c1', modules: ['a.ts', 'b.ts'], length: 2, severity: 'direct' };
    const recs = computeRecommendations({
      modules,
      edges: [edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts')],
      metrics: {
        'a.ts': metrics({ fanOut: 5, couplingScore: 0.8 }),
        'b.ts': metrics({ fanOut: 1, couplingScore: 0.2 }),
      },
      cycles: [cycle],
      layerViolations: [],
      hotZones: [],
    });
    expect(recs.some((r) => r.kind === 'cycle-break-cluster')).toBe(true);
  });

  it('cycle-break-cluster carries pattern and feedback edges', () => {
    // 3-cycle a→b→c→a, all in the same folder, no barrel - should be 'mixed'
    const modules = [module('foo/a.ts'), module('foo/b.ts'), module('foo/c.ts')];
    const cycle: Cycle = {
      id: 'c1',
      modules: ['foo/a.ts', 'foo/b.ts', 'foo/c.ts'],
      length: 3,
      severity: 'indirect',
    };
    const recs = computeRecommendations({
      modules,
      edges: [
        edge('foo/a.ts', 'foo/b.ts'),
        edge('foo/b.ts', 'foo/c.ts'),
        edge('foo/c.ts', 'foo/a.ts'),
      ],
      metrics: Object.fromEntries(modules.map((m) => [m.id, metrics()])),
      cycles: [cycle],
      layerViolations: [],
      hotZones: [],
    });
    const cluster = recs.find((r) => r.kind === 'cycle-break-cluster');
    expect(cluster).toBeDefined();
    expect(cluster!.params.pattern).toBe('mixed');
    expect(cluster!.params.sccLength).toBe(3);
    const fbs = cluster!.params.feedbackEdges;
    expect(Array.isArray(fbs)).toBe(true);
    expect((fbs as unknown[]).length).toBe(1); // ring breaks with one edge
  });

  it('detects barrel-cycle and surfaces barrel/sibling params', () => {
    const modules = [module('src/foo/index.ts'), module('src/foo/a.ts'), module('src/foo/b.ts')];
    const cycle: Cycle = {
      id: 'cb',
      modules: ['src/foo/index.ts', 'src/foo/a.ts', 'src/foo/b.ts'],
      length: 3,
      severity: 'indirect',
    };
    const recs = computeRecommendations({
      modules,
      edges: [
        edge('src/foo/index.ts', 'src/foo/a.ts'),
        edge('src/foo/a.ts', 'src/foo/b.ts'),
        edge('src/foo/b.ts', 'src/foo/index.ts'),
      ],
      metrics: Object.fromEntries(modules.map((m) => [m.id, metrics()])),
      cycles: [cycle],
      layerViolations: [],
      hotZones: [],
    });
    const cluster = recs.find((r) => r.kind === 'cycle-break-cluster');
    expect(cluster?.params.pattern).toBe('barrel-cycle');
    expect(cluster?.params.barrel).toBe('foo/index.ts');
  });

  it('flags a god-module by combining fan-in and LOC', () => {
    const big = module('src/entities/store.ts', { loc: 500 });
    const callers = Array.from({ length: 12 }, (_, i) => module(`src/c${i}.ts`));
    const allModules = [big, ...callers];
    const allMetrics: Record<string, ModuleMetrics> = {
      'src/entities/store.ts': metrics({ fanIn: 12 }),
    };
    for (const c of callers) allMetrics[c.id] = metrics({ fanOut: 1 });
    const recs = computeRecommendations({
      modules: allModules,
      edges: callers.map((c) => edge(c.id, big.id)),
      metrics: allMetrics,
      cycles: [],
      layerViolations: [],
      hotZones: [],
    });
    expect(recs.some((r) => r.kind === 'split-god-module')).toBe(true);
  });

  it('returns at most 20 items, sorted by weight', () => {
    const modules = Array.from({ length: 50 }, (_, i) => module(`src/x${i}.ts`, { kind: 'util' }));
    const m: Record<string, ModuleMetrics> = Object.fromEntries(
      modules.map((x) => [x.id, metrics()]),
    );
    const recs = computeRecommendations({
      modules,
      edges: [],
      metrics: m,
      cycles: [],
      layerViolations: [],
      hotZones: [],
    });
    expect(recs.length).toBeLessThanOrEqual(20);
    for (let i = 0; i < recs.length - 1; i++) {
      expect(recs[i]!.weight).toBeGreaterThanOrEqual(recs[i + 1]!.weight);
    }
  });

  it('emits structured params, not pre-formatted strings', () => {
    const recs = computeRecommendations({
      modules: [module('src/shared/lib/dead.ts', { kind: 'util' })],
      edges: [],
      metrics: { 'src/shared/lib/dead.ts': metrics() },
      cycles: [],
      layerViolations: [],
      hotZones: [],
    });
    const r = recs.find((x) => x.kind === 'unused-utility')!;
    expect(r.params.name).toBe('dead.ts');
  });

  it('only surfaces hidden cross-boundary temporal couplings, ranked, capped at 10', () => {
    function coupling(
      a: string,
      b: string,
      hidden: boolean,
      crossBoundary: boolean,
      risk: number,
    ): TemporalCoupling {
      return {
        a,
        b,
        coOccurrences: 5,
        scoreA: 0.8,
        scoreB: 0.8,
        score: 0.8,
        hidden,
        crossBoundary,
        risk,
      };
    }
    const temporalCoupling: TemporalCoupling[] = [
      coupling('features/a.ts', 'entities/b.ts', true, true, 0.9),
      coupling('features/c.ts', 'shared/d.ts', true, true, 0.7),
      coupling('shared/x.ts', 'shared/y.ts', true, false, 0.95), // same group: dropped
      coupling('features/e.ts', 'entities/f.ts', false, true, 0.95), // visible: dropped
    ];
    const recs = computeRecommendations({
      modules: [],
      edges: [],
      metrics: {},
      cycles: [],
      layerViolations: [],
      hotZones: [],
      temporalCoupling,
    });
    const temporal = recs.filter((r) => r.kind === 'temporal-coupling');
    expect(temporal).toHaveLength(2);
    // Input order is risk-sorted by the detector and preserved.
    expect(temporal[0]!.modules).toEqual(['features/a.ts', 'entities/b.ts']);
    expect(temporal[1]!.modules).toEqual(['features/c.ts', 'shared/d.ts']);
  });

  it('caps temporal-coupling recommendations at 10', () => {
    const temporalCoupling: TemporalCoupling[] = Array.from({ length: 15 }, (_, i) => ({
      a: `features/a${i}.ts`,
      b: `entities/b${i}.ts`,
      coOccurrences: 5,
      scoreA: 0.8,
      scoreB: 0.8,
      score: 0.8,
      hidden: true,
      crossBoundary: true,
      risk: 1 - i * 0.01,
    }));
    const recs = computeRecommendations({
      modules: [],
      edges: [],
      metrics: {},
      cycles: [],
      layerViolations: [],
      hotZones: [],
      temporalCoupling,
    });
    expect(recs.filter((r) => r.kind === 'temporal-coupling')).toHaveLength(10);
  });
});
