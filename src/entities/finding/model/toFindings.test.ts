import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import { FINDING_TYPES } from './types';
import { toFindings } from './toFindings';

function fullScan(): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [{ id: 'cycle:1', modules: ['a', 'b'], length: 2, severity: 'direct' }],
    metrics: {
      'src/hot.ts': {
        fanIn: 5,
        fanOut: 5,
        instability: 0.5,
        depth: 1,
        inCycle: false,
        couplingScore: 25,
        hotnessScore: 50,
      },
    },
    hotZones: ['src/hot.ts'],
    layerViolations: [
      {
        edgeId: 'e1',
        from: 'a',
        to: 'b',
        fromLayer: 'entities',
        toLayer: 'features',
        severity: 'error',
      },
    ],
    archDebt: {
      score: 30,
      grade: 'C',
      breakdown: { cycles: 1, layerViolations: 1, hotZones: 1, coupling: 1 },
    },
    recommendations: [],
    contractViolations: [
      {
        id: 'boundary:r:0',
        kind: 'boundary',
        ruleName: 'r',
        severity: 'warning',
        message: 'm',
        modules: ['a', 'b'],
      },
    ],
    temporalCoupling: [
      {
        a: 'a',
        b: 'c',
        coOccurrences: 4,
        scoreA: 0.7,
        scoreB: 0.6,
        score: 0.6,
        hidden: true,
        crossBoundary: true,
        risk: 0.8,
      },
    ],
    memoryRisks: [
      {
        id: 'm1',
        kind: 'timer-cleanup',
        moduleId: 'src/m.ts',
        severity: 'medium',
        confidence: 'medium',
        evidence: [],
        remediation: 'r',
      },
    ],
    asyncLifecycleRisks: [
      {
        id: 'a1',
        kind: 'async-effect-cleanup',
        moduleId: 'src/a.ts',
        severity: 'low',
        confidence: 'low',
        evidence: [],
        remediation: 'r',
      },
    ],
    configDiagnostics: [
      { file: '.archora.json', path: 'contracts[0]', severity: 'warning', message: 'bad' },
    ],
    scannedAt: '2026-06-20T10:00:00.000Z',
    durationMs: 1,
    warnings: [],
  };
}

describe('toFindings', () => {
  it('produces exactly one finding per type for a one-of-each scan (completeness)', () => {
    const findings = toFindings(fullScan());
    const types = findings.map((f) => f.type).sort();
    expect(types).toEqual([...FINDING_TYPES].sort());
  });

  it('omits optional slices safely', () => {
    const scan = fullScan();
    delete scan.temporalCoupling;
    delete scan.memoryRisks;
    delete scan.asyncLifecycleRisks;
    delete scan.configDiagnostics;
    const types = new Set(toFindings(scan).map((f) => f.type));
    expect(types.has('coupling')).toBe(false);
    expect(types.has('cycle')).toBe(true);
  });

  it('skips hotspots with no metrics entry', () => {
    const scan = fullScan();
    scan.hotZones = ['src/hot.ts', 'src/missing.ts'];
    expect(toFindings(scan).filter((f) => f.type === 'hotspot')).toHaveLength(1);
  });

  describe('coupling filter', () => {
    it('same-group pair is dropped', () => {
      const scan = fullScan();
      scan.temporalCoupling = [
        {
          a: 'a',
          b: 'b',
          coOccurrences: 5,
          scoreA: 0.8,
          scoreB: 0.7,
          score: 0.7,
          hidden: true,
          crossBoundary: false,
          risk: 0.9,
        },
      ];
      const findings = toFindings(scan).filter((f) => f.type === 'coupling');
      expect(findings).toHaveLength(0);
    });

    it('cross-boundary hidden pair is kept', () => {
      const scan = fullScan();
      scan.temporalCoupling = [
        {
          a: 'a',
          b: 'b',
          coOccurrences: 5,
          scoreA: 0.8,
          scoreB: 0.7,
          score: 0.7,
          hidden: true,
          crossBoundary: true,
          risk: 0.9,
        },
      ];
      const findings = toFindings(scan).filter((f) => f.type === 'coupling');
      expect(findings).toHaveLength(1);
    });

    it('cap at 10', () => {
      const scan = fullScan();
      const couplings = Array.from({ length: 15 }, (_, i) => ({
        a: `a${i}`,
        b: `b${i}`,
        coOccurrences: 3,
        scoreA: 0.5,
        scoreB: 0.5,
        score: 0.5,
        hidden: true,
        crossBoundary: true,
        risk: (15 - i) / 15,
      }));
      scan.temporalCoupling = couplings;
      const findings = toFindings(scan).filter((f) => f.type === 'coupling');
      expect(findings).toHaveLength(10);

      // Verify findings correspond to the top 10 highest-risk couplings
      // couplingToFinding maps coupling.risk * 100 to finding.risk, rounded
      const findingRisks = findings.map((f) => f.risk ?? 0);

      // The highest-risk coupling (index 0: risk = 15/15 = 1.0) → finding.risk = 100
      expect(findingRisks[0]).toBe(100);

      // The 10th-highest (index 9: risk = 6/15 ≈ 0.4) → finding.risk = 40
      expect(findingRisks[9]).toBe(40);

      // Risk values should be in descending order
      for (let i = 1; i < findingRisks.length; i++) {
        expect(findingRisks[i]!).toBeLessThanOrEqual(findingRisks[i - 1]!);
      }

      // The 11th coupling (index 10: risk = 5/15 ≈ 0.333 → 33) must NOT be in findings
      const droppedCouplingRiskCalculated = Math.round((5 / 15) * 100);
      expect(droppedCouplingRiskCalculated).toBe(33);
      // None of the 10 emitted findings should have risk <= 33
      expect(Math.min(...findingRisks)).toBeGreaterThan(33);
    });
  });
});
