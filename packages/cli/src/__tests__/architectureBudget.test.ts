import { describe, expect, it } from 'vitest';
import { evaluateArchitectureBudget } from '../lib/architectureBudget';
import type { ArchoraConfig, ScanDiff, ScanResult } from '@archora/core';

describe('evaluateArchitectureBudget', () => {
  it('reports only configured budget failures', () => {
    const config: ArchoraConfig = {
      architectureBudget: {
        maxDebtScore: 20,
        maxCycles: 1,
        maxCriticalSignals: 0,
        maxContractErrors: 0,
      },
    };
    const result = evaluateArchitectureBudget(config, scanFixture(), null);

    expect(result.failed).toBe(true);
    expect(result.reasons.map((reason) => reason.key)).toEqual([
      'maxDebtScore',
      'maxCriticalSignals',
      'maxContractErrors',
    ]);
  });

  it('uses diff context for hotspot growth', () => {
    const config: ArchoraConfig = {
      architectureBudget: {
        maxHotspotGrowth: 0,
      },
    };
    const result = evaluateArchitectureBudget(config, scanFixture(), {
      diff: {
        addedModules: [],
        removedModules: [],
        changedModules: [{ id: 'src/hot.ts' }],
      } as unknown as ScanDiff,
      baseline: scanFixture({ hotZones: [] }),
    });

    expect(result.failed).toBe(true);
    expect(result.reasons[0]).toMatchObject({
      key: 'maxHotspotGrowth',
      actual: 1,
      limit: 0,
    });
  });
});

function scanFixture(overrides: Partial<ScanResult> = {}): ScanResult {
  const cycle = { id: 'cycle:a', modules: ['src/a.ts'], length: 1, severity: 'direct' as const };
  return {
    project: { id: 'p', name: 'project', rootPath: '/repo', detectedFramework: 'generic' },
    modules: [],
    edges: [],
    cycles: [cycle],
    metrics: {},
    hotZones: ['src/hot.ts'],
    layerViolations: [],
    archDebt: {
      score: 42,
      grade: 'C',
      breakdown: { cycles: 1, layerViolations: 0, hotZones: 1, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [
      {
        id: 'contract:error',
        kind: 'boundary',
        ruleName: 'boundary',
        severity: 'error',
        message: 'contract failed',
        modules: ['src/a.ts'],
      },
    ],
    signals: [
      {
        id: 'signal:critical',
        stableKey: 'contract:critical',
        kind: 'contract-violation',
        title: 'critical signal',
        severity: 'critical',
        confidence: 'high',
        actionability: 'manual',
        status: 'new',
        maturity: 'stable',
        modules: ['src/a.ts'],
        evidence: [{ kind: 'contract', message: 'critical', confidence: 'high' }],
        limitations: [],
        ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
      },
    ],
    scannedAt: '2026-05-25T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
    ...overrides,
  };
}
