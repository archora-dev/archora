import { describe, expect, it } from 'vitest';
import { buildFixPlanReport } from '../buildFixPlanReport';
import type { ScanResult } from '@/core/analyzer/types';

describe('buildFixPlanReport', () => {
  it('exports a repair-oriented fix plan from scan findings', () => {
    const report = JSON.parse(
      buildFixPlanReport(scanFixture(), {
        exportedAt: '2026-05-11T00:00:00.000Z',
        appVersion: 'test',
      }),
    );

    expect(report.kind).toBe('archora-fix-plan');
    expect(report.project.name).toBe('demo');
    expect(report.summary).toEqual({
      cycles: 1,
      layerViolations: 1,
      contractViolations: 0,
      hotZones: 1,
      generatedModules: 0,
    });
    expect(report.priorityFindings[0]).toMatchObject({
      type: 'cycle',
      title: 'Direct dependency cycle',
      action: expect.stringContaining('Break the import from'),
    });
    expect(report.priorityFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'recommendation',
          title: 'cycle-break-cluster',
        }),
      ]),
    );
    expect(report.verificationOrder).toContain('Verify layer boundary fixes');
  });
});

function scanFixture(): ScanResult {
  return {
    project: { id: 'demo', name: 'demo', rootPath: '/repo/demo', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [
      {
        id: 'cycle:auth',
        modules: ['src/a.ts', 'src/b.ts'],
        length: 2,
        severity: 'direct',
      },
    ],
    metrics: {},
    hotZones: ['src/a.ts'],
    layerViolations: [
      {
        edgeId: 'shared-to-feature',
        from: 'src/shared/api.ts',
        to: 'src/features/auth.ts',
        fromLayer: 'shared',
        toLayer: 'features',
        severity: 'error',
      },
    ],
    archDebt: {
      score: 42,
      grade: 'C',
      breakdown: { cycles: 20, layerViolations: 20, hotZones: 2, coupling: 0 },
    },
    recommendations: [
      {
        id: 'rec-cycle',
        kind: 'cycle-break-cluster',
        modules: ['src/a.ts', 'src/b.ts'],
        params: {},
        weight: 10,
      },
    ],
    contractViolations: [],
    scannedAt: '2026-05-10T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
  };
}
