import { describe, expect, it } from 'vitest';
import type {
  AsyncLifecycleRiskFinding,
  ConfigDiagnostic,
  ContractViolation,
  Cycle,
  LayerViolation,
  MemoryRiskFinding,
  ModuleMetrics,
  TemporalCoupling,
} from '@/core/analyzer/types';
import {
  asyncLifecycleToFinding,
  contractToFinding,
  couplingToFinding,
  cycleToFinding,
  hotspotToFinding,
  layerViolationToFinding,
  memoryToFinding,
  setupToFinding,
} from './adapters';

const metrics: ModuleMetrics = {
  fanIn: 4,
  fanOut: 6,
  instability: 0.6,
  depth: 2,
  inCycle: true,
  couplingScore: 24,
  hotnessScore: 42,
};

describe('module-anchored adapters', () => {
  it('cycle → finding', () => {
    const cycle: Cycle = { id: 'cycle:ab12', modules: ['a', 'b'], length: 2, severity: 'direct' };
    const f = cycleToFinding(cycle);
    expect(f).toMatchObject({
      id: 'cycle:cycle:ab12',
      type: 'cycle',
      severity: 'high',
      location: 'a',
      beta: false,
      inChangeSet: false,
    });
    expect(f.modules).toEqual(['a', 'b']);
    expect(f.title.i18nKey).toBe('entities.finding.cycle.title');
    expect(f.evidence).toEqual({ kind: 'cycle', cycle });
  });

  it('large cycle → reframed as a tangled cluster', () => {
    const modules = Array.from({ length: 40 }, (_, i) => `m${i}`);
    const cycle: Cycle = { id: 'cycle:big', modules, length: 40, severity: 'direct' };
    const f = cycleToFinding(cycle);
    expect(f.type).toBe('cycle');
    expect(f.title.i18nKey).toBe('entities.finding.cluster.title');
    expect(f.title.params).toEqual({ count: 40 });
  });

  it('layer violation → finding', () => {
    const v: LayerViolation = {
      edgeId: 'e1',
      from: 'a',
      to: 'b',
      fromLayer: 'entities',
      toLayer: 'features',
      severity: 'error',
    };
    const f = layerViolationToFinding(v);
    expect(f).toMatchObject({
      id: 'layer-violation:e1',
      type: 'layer-violation',
      severity: 'high',
      location: 'a',
    });
    expect(f.title.params).toEqual({ from: 'entities', to: 'features' });
  });

  it('hotspot → finding with risk from hotnessScore', () => {
    const f = hotspotToFinding('src/x.ts', metrics, 0, 9);
    expect(f).toMatchObject({
      id: 'hotspot:src/x.ts',
      type: 'hotspot',
      severity: 'high',
      location: 'src/x.ts',
      risk: 42,
    });
    expect(f.evidence).toEqual({ kind: 'hotspot', moduleId: 'src/x.ts', metrics, rank: 0 });
  });

  it('contract → finding (boundary)', () => {
    const v: ContractViolation = {
      id: 'boundary:no-up:0',
      kind: 'boundary',
      ruleName: 'no-up',
      severity: 'warning',
      message: 'x',
      modules: ['a', 'b'],
    };
    const f = contractToFinding(v);
    expect(f).toMatchObject({
      id: 'contract:boundary:no-up:0',
      type: 'contract',
      severity: 'medium',
      location: 'a',
    });
    expect(f.title.i18nKey).toBe('entities.finding.contract.title');
  });

  it('contract → finding (rsc-leak gets its own title)', () => {
    const v: ContractViolation = {
      id: 'rsc-leak:leak:1',
      kind: 'rsc-leak',
      ruleName: 'leak',
      severity: 'error',
      message: 'x',
      modules: ['a'],
    };
    expect(contractToFinding(v).title.i18nKey).toBe('entities.finding.rscLeak.title');
  });
});

describe('remaining adapters', () => {
  it('coupling → finding with risk scaled to 0..100', () => {
    const c: TemporalCoupling = {
      a: 'a',
      b: 'b',
      coOccurrences: 7,
      scoreA: 0.8,
      scoreB: 0.7,
      score: 0.7,
      hidden: true,
      crossBoundary: true,
      risk: 0.9,
    };
    const f = couplingToFinding(c);
    expect(f).toMatchObject({
      id: 'coupling:a b',
      type: 'coupling',
      severity: 'high',
      location: 'a',
      risk: 90,
    });
    expect(f.modules).toEqual(['a', 'b']);
  });

  it('memory risk → beta finding', () => {
    const m: MemoryRiskFinding = {
      id: 'mem-1',
      kind: 'timer-cleanup',
      moduleId: 'src/x.ts',
      severity: 'medium',
      confidence: 'medium',
      evidence: [],
      remediation: 'r',
    };
    const f = memoryToFinding(m);
    expect(f).toMatchObject({
      id: 'memory:mem-1',
      type: 'memory',
      severity: 'medium',
      beta: true,
      location: 'src/x.ts',
    });
  });

  it('async lifecycle risk → beta finding', () => {
    const a: AsyncLifecycleRiskFinding = {
      id: 'async-1',
      kind: 'async-effect-cleanup',
      moduleId: 'src/y.ts',
      severity: 'low',
      confidence: 'low',
      evidence: [],
      remediation: 'r',
    };
    const f = asyncLifecycleToFinding(a);
    expect(f).toMatchObject({
      id: 'async-lifecycle:async-1',
      type: 'async-lifecycle',
      severity: 'low',
      beta: true,
    });
  });

  it('config diagnostic → setup finding', () => {
    const d: ConfigDiagnostic = {
      file: '.archora.json',
      path: 'contracts[0]',
      severity: 'warning',
      message: 'bad',
    };
    const f = setupToFinding(d, 0);
    expect(f).toMatchObject({
      id: 'setup:0:contracts[0]',
      type: 'setup',
      severity: 'medium',
      beta: false,
    });
    expect(f.modules).toEqual([]);
    expect(f.location).toBeUndefined();
  });
});
