import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import { buildChangeRisk } from './buildChangeRisk';

function makeModule(id: string): ScanResult['modules'][number] {
  return {
    id,
    absPath: `/${id}`,
    kind: 'module',
    language: 'ts',
    loc: 10,
    exports: [],
    isInfra: false,
  };
}

// A scan with a couple of hot zones and a non-zero arch-debt score produces a
// medium verdict; the modules in hotZones become checkFirst entries.
function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [makeModule('src/a.ts'), makeModule('src/b.ts'), makeModule('src/c.ts')],
    edges: [{ from: 'src/a.ts', to: 'src/b.ts', kind: 'static', specifier: './b', resolved: true }],
    cycles: [],
    metrics: {},
    hotZones: ['src/a.ts', 'src/b.ts'],
    layerViolations: [],
    archDebt: {
      score: 30,
      grade: 'C',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 6, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
    ...overrides,
  };
}

describe('buildChangeRisk', () => {
  it('returns a current-state verdict without a baseline', () => {
    const view = buildChangeRisk(makeScan(), null);

    expect(view.level).toBe('medium');
    expect(view.score).toBeGreaterThan(0);
    expect(view.reasons).toContain('2 hot zone(s)');
    expect(view.checkFirst).toEqual(['src/a.ts', 'src/b.ts']);
    expect(view.baseline).toBeUndefined();
    expect(view.regressions).toEqual([]);
  });

  it('adds regression tracking when a baseline is supplied', () => {
    // Baseline has no hot zones; the current scan introduces two, so the diff
    // reports changed modules and the view exposes a baseline delta block.
    const baseline = makeScan({
      hotZones: [],
      archDebt: {
        score: 5,
        grade: 'A',
        breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
      },
    });
    const view = buildChangeRisk(makeScan(), baseline);

    expect(view.baseline).toBeDefined();
    expect(view.level).toBe('medium');
    expect(view.score).toBeGreaterThanOrEqual(buildChangeRisk(makeScan(), null).score);
  });
});
