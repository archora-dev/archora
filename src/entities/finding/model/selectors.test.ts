import { describe, expect, it } from 'vitest';
import type { ScanDiff } from '@/core/diff';
import type { Finding } from './types';
import {
  countBySeverity,
  countByType,
  filterFindings,
  gradeOf,
  partitionChangeSet,
} from './selectors';

function finding(over: Partial<Finding>): Finding {
  return {
    id: 'x',
    type: 'cycle',
    severity: 'high',
    title: { i18nKey: 'k', params: {} },
    modules: [],
    beta: false,
    inChangeSet: false,
    evidence: { kind: 'cycle', cycle: { id: 'c', modules: [], length: 0, severity: 'direct' } },
    ...over,
  };
}

describe('finding selectors', () => {
  const findings = [
    finding({ id: '1', type: 'cycle', severity: 'high' }),
    finding({ id: '2', type: 'hotspot', severity: 'medium' }),
    finding({ id: '3', type: 'memory', severity: 'low', beta: true }),
  ];

  it('counts by type with every type present (zeros included)', () => {
    const counts = countByType(findings);
    expect(counts.cycle).toBe(1);
    expect(counts.hotspot).toBe(1);
    expect(counts.coupling).toBe(0);
  });

  it('counts by severity', () => {
    expect(countBySeverity(findings)).toMatchObject({ high: 1, medium: 1, low: 1 });
  });

  it('passes grade through from the scan', () => {
    expect(gradeOf({ archDebt: { grade: 'B' } } as never)).toBe('B');
  });

  it('filters by type', () => {
    expect(filterFindings(findings, { types: ['cycle'] }).map((f) => f.id)).toEqual(['1']);
  });

  it('excludes beta when includeBeta is false', () => {
    expect(filterFindings(findings, { includeBeta: false }).map((f) => f.id)).toEqual(['1', '2']);
  });

  it('filters by severity', () => {
    expect(filterFindings(findings, { severities: ['low'] }).map((f) => f.id)).toEqual(['3']);
  });
});

describe('partitionChangeSet', () => {
  const diff: ScanDiff = {
    projectId: 'p',
    projectName: 'p',
    prevScannedAt: 't0',
    nextScannedAt: 't1',
    addedModules: [
      {
        id: 'src/new.ts',
        absPath: '/x',
        kind: 'module',
        language: 'ts',
        loc: 1,
        exports: [],
        isInfra: false,
      },
    ],
    removedModules: [],
    changedModules: [],
    newCycles: [{ id: 'cycle:9', modules: ['a'], length: 1, severity: 'direct' }],
    resolvedCycles: [],
    newLayerViolations: [],
    resolvedLayerViolations: [],
    newContractViolations: [],
    resolvedContractViolations: [],
    summary: {
      addedModules: 1,
      removedModules: 0,
      changedModules: 0,
      newCycles: 1,
      resolvedCycles: 0,
      newLayerViolations: 0,
      newContractViolations: 0,
    },
  };

  it('flags a finding anchored on an added module', () => {
    const f = finding({ id: 'h', type: 'hotspot', location: 'src/new.ts' });
    const [out] = partitionChangeSet([f], diff) as [typeof f];
    expect(out.inChangeSet).toBe(true);
  });

  it('flags a cycle finding whose cycle is new', () => {
    const f = finding({
      id: 'c',
      type: 'cycle',
      location: 'a',
      evidence: {
        kind: 'cycle',
        cycle: { id: 'cycle:9', modules: ['a'], length: 1, severity: 'direct' },
      },
    });
    expect(partitionChangeSet([f], diff)[0]!.inChangeSet).toBe(true);
  });

  it('leaves unrelated findings unchanged (same reference)', () => {
    const f = finding({ id: 'h2', type: 'hotspot', location: 'src/old.ts' });
    const [out] = partitionChangeSet([f], diff) as [typeof f];
    expect(out).toBe(f);
    expect(out.inChangeSet).toBe(false);
  });
});
