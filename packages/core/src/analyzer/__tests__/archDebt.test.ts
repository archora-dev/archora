import { describe, expect, it } from 'vitest';
import { computeArchDebt } from '../archDebt';
import type { Cycle, LayerViolation, ModuleMetrics, ModuleNode } from '../types';

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

describe('computeArchDebt', () => {
  it('returns grade A for a clean project', () => {
    const debt = computeArchDebt({
      modules: [module('a.ts'), module('b.ts')],
      cycles: [],
      layerViolations: [],
      metrics: { 'a.ts': metrics(), 'b.ts': metrics() },
      hotZoneCount: 0,
    });
    expect(debt.grade).toBe('A');
    expect(debt.score).toBeLessThan(15);
  });

  it('penalizes direct cycles harder than indirect ones', () => {
    const direct: Cycle = { id: '1', modules: ['a.ts', 'b.ts'], length: 2, severity: 'direct' };
    const indirect: Cycle = {
      id: '2',
      modules: ['c.ts', 'd.ts', 'e.ts'],
      length: 3,
      severity: 'indirect',
    };
    const modules = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map((id) => module(id));
    const m: Record<string, ModuleMetrics> = Object.fromEntries(
      modules.map((mod) => [mod.id, metrics()]),
    );
    const withDirect = computeArchDebt({
      modules,
      cycles: [direct],
      layerViolations: [],
      metrics: m,
      hotZoneCount: 0,
    });
    const withIndirect = computeArchDebt({
      modules,
      cycles: [indirect],
      layerViolations: [],
      metrics: m,
      hotZoneCount: 0,
    });
    expect(withDirect.score).toBeGreaterThan(withIndirect.score);
  });

  it('breakdown sums each subcategory independently', () => {
    const violations: LayerViolation[] = [
      {
        edgeId: 'a',
        from: 'a',
        to: 'b',
        fromLayer: 'entities',
        toLayer: 'widgets',
        severity: 'error',
      },
    ];
    const debt = computeArchDebt({
      modules: [module('a'), module('b')],
      cycles: [],
      layerViolations: violations,
      metrics: { a: metrics(), b: metrics() },
      hotZoneCount: 0,
    });
    expect(debt.breakdown.layerViolations).toBeGreaterThan(0);
    expect(debt.breakdown.cycles).toBe(0);
  });

  it('scales sub-scores from 0 to 100', () => {
    const debt = computeArchDebt({
      modules: [module('a'), module('b')],
      cycles: Array.from({ length: 50 }).map((_, i) => ({
        id: String(i),
        modules: ['a', 'b'],
        length: 2,
        severity: 'direct' as const,
      })),
      layerViolations: [],
      metrics: { a: metrics(), b: metrics() },
      hotZoneCount: 0,
    });
    expect(debt.breakdown.cycles).toBeGreaterThan(80);
    expect(debt.breakdown.cycles).toBeLessThanOrEqual(100);
  });
});
