import { describe, it, expect } from 'vitest';
import { diffScans } from '../diffScans';
import type {
  ContractViolation,
  Cycle,
  LayerViolation,
  ModuleNode,
  ScanResult,
} from '../../analyzer/types';

function mod(id: string, overrides: Partial<ModuleNode> = {}): ModuleNode {
  return {
    id,
    absPath: '/' + id,
    kind: 'util',
    language: 'ts',
    loc: 10,
    exports: [],
    isInfra: false,
    ...overrides,
  };
}

function cycle(id: string, modules: string[]): Cycle {
  return {
    id,
    modules,
    length: modules.length,
    severity: modules.length <= 2 ? 'direct' : 'indirect',
  };
}

function layerViolation(edgeId: string, overrides: Partial<LayerViolation> = {}): LayerViolation {
  return {
    edgeId,
    from: 'src/a.ts',
    to: 'src/b.ts',
    fromLayer: 'features',
    toLayer: 'app',
    severity: 'error',
    ...overrides,
  };
}

function contractViolation(
  id: string,
  overrides: Partial<ContractViolation> = {},
): ContractViolation {
  return {
    id,
    kind: 'boundary',
    ruleName: 'no-cross-layer',
    severity: 'error',
    message: 'boundary violation',
    modules: ['src/a.ts'],
    ...overrides,
  };
}

function scan(overrides: Partial<ScanResult>): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/p', detectedFramework: 'unknown' },
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
    scannedAt: '2026-05-07T00:00:00Z',
    durationMs: 0,
    warnings: [],
    ...overrides,
  };
}

describe('diffScans', () => {
  it('reports added and removed modules', () => {
    const prev = scan({ modules: [mod('a'), mod('b')] });
    const next = scan({ modules: [mod('a'), mod('c')] });
    const d = diffScans(prev, next);
    expect(d.addedModules.map((m) => m.id)).toEqual(['c']);
    expect(d.removedModules.map((m) => m.id)).toEqual(['b']);
    expect(d.changedModules).toEqual([]);
    expect(d.summary).toMatchObject({ addedModules: 1, removedModules: 1, changedModules: 0 });
  });

  it('reports changed modules only on visible attributes', () => {
    const prev = scan({ modules: [mod('a', { kind: 'util', loc: 10 })] });
    const next = scan({ modules: [mod('a', { kind: 'route', loc: 12 })] });
    const d = diffScans(prev, next);
    expect(d.changedModules).toHaveLength(1);
    expect(d.changedModules[0]?.prev.kind).toBe('util');
    expect(d.changedModules[0]?.next.kind).toBe('route');
  });

  it('does not flag identical modules as changed', () => {
    const prev = scan({ modules: [mod('a')] });
    const next = scan({ modules: [mod('a')] });
    expect(diffScans(prev, next).changedModules).toEqual([]);
  });

  it('matches cycles by module-set ignoring analyzer cycle ids and order', () => {
    const prev = scan({
      cycles: [cycle('c1', ['a', 'b']), cycle('c2', ['x', 'y', 'z'])],
    });
    const next = scan({
      // same set members, different ids and order
      cycles: [cycle('c99', ['b', 'a']), cycle('c100', ['n', 'm'])],
    });
    const d = diffScans(prev, next);
    expect(d.newCycles.map((c) => c.modules.sort())).toEqual([['m', 'n']]);
    expect(d.resolvedCycles.map((c) => c.modules.sort())).toEqual([['x', 'y', 'z']]);
  });

  it('returns empty diff for identical scans', () => {
    const s = scan({
      modules: [mod('a'), mod('b')],
      cycles: [cycle('c1', ['a', 'b'])],
    });
    const d = diffScans(s, s);
    expect(d.summary).toEqual({
      addedModules: 0,
      removedModules: 0,
      changedModules: 0,
      newCycles: 0,
      resolvedCycles: 0,
      newLayerViolations: 0,
      newContractViolations: 0,
    });
  });

  it('diffs layer violations by edgeId', () => {
    const shared = layerViolation('edge:a→b');
    const prev = scan({
      layerViolations: [shared, layerViolation('edge:c→d')],
    });
    const next = scan({
      layerViolations: [shared, layerViolation('edge:e→f')],
    });
    const d = diffScans(prev, next);
    expect(d.newLayerViolations.map((v) => v.edgeId)).toEqual(['edge:e→f']);
    expect(d.resolvedLayerViolations.map((v) => v.edgeId)).toEqual(['edge:c→d']);
    expect(d.summary.newLayerViolations).toBe(1);
  });

  it('diffs contract violations by id', () => {
    const shared = contractViolation('boundary:auth:0');
    const prev = scan({
      contractViolations: [shared, contractViolation('boundary:payment:0')],
    });
    const next = scan({
      contractViolations: [shared, contractViolation('boundary:cart:0')],
    });
    const d = diffScans(prev, next);
    expect(d.newContractViolations.map((v) => v.id)).toEqual(['boundary:cart:0']);
    expect(d.resolvedContractViolations.map((v) => v.id)).toEqual(['boundary:payment:0']);
    expect(d.summary.newContractViolations).toBe(1);
  });
});
