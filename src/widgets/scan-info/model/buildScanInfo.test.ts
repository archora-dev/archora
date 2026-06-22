import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import { buildScanInfo } from './buildScanInfo';

const baseScan: ScanResult = {
  project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
  modules: [
    { id: 'a', absPath: '/a', kind: 'module', language: 'ts', loc: 1, exports: [], isInfra: false },
  ],
  edges: [{ from: 'a', to: 'b', kind: 'static', specifier: './b', resolved: true }],
  cycles: [],
  metrics: {},
  hotZones: [],
  layerViolations: [],
  archDebt: {
    score: 42,
    grade: 'C',
    breakdown: { cycles: 1, layerViolations: 2, hotZones: 3, coupling: 4 },
  },
  recommendations: [],
  contractViolations: [],
  insights: [
    {
      id: 'i',
      title: 't',
      severity: 'low',
      confidence: 'low',
      signals: [],
      modules: [],
      rankingScore: 1,
      summary: 's',
    },
  ],
  scannedAt: 't',
  durationMs: 123,
  warnings: [{ code: 'parse-failed', message: 'x' }],
};

describe('buildScanInfo', () => {
  it('summarizes scan meta', () => {
    expect(buildScanInfo(baseScan)).toMatchObject({
      grade: 'C',
      debtScore: 42,
      durationMs: 123,
      warningCount: 1,
      moduleCount: 1,
      edgeCount: 1,
      insightCount: 1,
    });
  });

  it('defaults configState to not-configured when configStatus is absent', () => {
    const result = buildScanInfo(baseScan);
    expect(result.configState).toBe('not-configured');
    expect(result.signalCount).toBe(0);
    expect(result.recommendationCount).toBe(0);
  });

  it('picks up configStatus and recommendations when present', () => {
    const scan: ScanResult = {
      ...baseScan,
      configStatus: { state: 'loaded', file: '.archora.json' },
      recommendations: [
        { id: 'r1', kind: 'type-only-candidate', modules: ['a'], params: {}, weight: 1 },
      ],
    };
    const result = buildScanInfo(scan);
    expect(result.configState).toBe('loaded');
    expect(result.recommendationCount).toBe(1);
  });

  it('counts signals when present', () => {
    const scanWithSignals = { ...baseScan, signals: [{ id: 's1' }] } as unknown as ScanResult;
    expect(buildScanInfo(scanWithSignals).signalCount).toBe(1);
  });
});
