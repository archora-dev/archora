import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import type { TriageState } from '@/entities/finding-triage';
import { deriveCockpitFindings } from './deriveCockpitFindings';

function scan(scannedAt: string, withExtraCycle: boolean): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [
      {
        id: 'a',
        absPath: '/a',
        kind: 'module',
        language: 'ts',
        loc: 10,
        exports: [],
        isInfra: false,
      },
      {
        id: 'b',
        absPath: '/b',
        kind: 'module',
        language: 'ts',
        loc: 10,
        exports: [],
        isInfra: false,
      },
    ],
    edges: [],
    cycles: withExtraCycle
      ? [{ id: 'cycle:1', modules: ['a', 'b'], length: 2, severity: 'direct' }]
      : [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 10,
      grade: withExtraCycle ? 'C' : 'A',
      breakdown: { cycles: withExtraCycle ? 1 : 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    memoryRisks: [
      {
        id: 'm1',
        kind: 'timer-cleanup',
        moduleId: 'a',
        severity: 'low',
        confidence: 'low',
        evidence: [],
        remediation: 'r',
      },
    ],
    scannedAt,
    durationMs: 1,
    warnings: [],
  };
}

describe('deriveCockpitFindings', () => {
  it('everything lens returns all findings, with counts and grade', () => {
    const r = deriveCockpitFindings({
      scan: scan('t1', true),
      baselineScan: null,
      lens: 'everything',
      filter: { includeBeta: true },
    });
    expect(r.grade).toBe('C');
    expect(r.total).toBe(2); // 1 cycle + 1 memory
    expect(r.countsByType.cycle).toBe(1);
    expect(r.hasBaseline).toBe(false);
  });

  it('changed lens keeps only findings new vs baseline', () => {
    const r = deriveCockpitFindings({
      scan: scan('t1', true),
      baselineScan: scan('t0', false),
      lens: 'changed',
      filter: { includeBeta: true },
    });
    // the new cycle is in the change set; the memory risk anchored on unchanged 'a' is not
    expect(r.findings.map((f) => f.type)).toEqual(['cycle']);
    expect(r.hasBaseline).toBe(true);
  });

  it('triage hides snoozed/wont-fix by default, keeps acknowledged, and counts hidden', () => {
    const states: Record<string, TriageState> = {
      'cycle:cycle:1': 'snoozed',
      'memory:m1': 'acknowledged',
    };
    const lookup = (id: string): TriageState => states[id] ?? 'active';

    const hidden = deriveCockpitFindings({
      scan: scan('t1', true),
      baselineScan: null,
      lens: 'everything',
      filter: { includeBeta: true },
      triage: lookup,
    });
    // snoozed cycle dropped; acknowledged memory stays
    expect(hidden.findings.map((f) => f.id)).toEqual(['memory:m1']);
    expect(hidden.hiddenByTriage).toBe(1);

    const shown = deriveCockpitFindings({
      scan: scan('t1', true),
      baselineScan: null,
      lens: 'everything',
      filter: { includeBeta: true },
      triage: lookup,
      showTriaged: true,
    });
    // toggle on: snoozed comes back, nothing reported hidden
    expect(shown.findings.map((f) => f.id).sort()).toEqual(['cycle:cycle:1', 'memory:m1']);
    expect(shown.hiddenByTriage).toBe(0);
  });

  it('filter excludes beta', () => {
    const r = deriveCockpitFindings({
      scan: scan('t1', false),
      baselineScan: null,
      lens: 'everything',
      filter: { includeBeta: false },
    });
    expect(r.findings).toHaveLength(0); // only the beta memory risk existed
  });
});
