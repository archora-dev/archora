import { describe, expect, it } from 'vitest';
import { buildFixPlanHtmlReport } from '../buildFixPlanHtmlReport';
import type { ScanResult } from '@/core/analyzer/types';

describe('buildFixPlanHtmlReport', () => {
  it('renders a readable HTML fix plan, not raw JSON', () => {
    const html = buildFixPlanHtmlReport(scanFixture(), {
      exportedAt: '2026-05-11T00:00:00.000Z',
      appVersion: 'test',
    });

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Archora fix plan - demo</title>');
    expect(html).toContain('Fix plan — demo');
    expect(html).toContain('Repair order');
    expect(html).toContain('Suggested batches');
    expect(html).toContain('Verification order');
  });

  it('reflects the scan counts so the document matches the analysis', () => {
    const html = buildFixPlanHtmlReport(scanFixture(), { appVersion: 'test' });

    // Architecture grade and summary metrics come straight from the scan.
    expect(html).toContain('<strong>C</strong>');
    expect(html).toContain('<dt>Cycles</dt><dd>1</dd>');
    expect(html).toContain('<dt>Layer violations</dt><dd>1</dd>');
    expect(html).toContain('<dt>Hot zones</dt><dd>1</dd>');
    // The top cycle finding surfaces its concrete repair action.
    expect(html).toContain('Break the import from');
    // Raw plan stays available for anyone who wants the machine-readable form.
    expect(html).toContain('archora-fix-plan');
  });

  it('escapes dynamic values from the scan', () => {
    const scan = scanFixture();
    scan.project.name = '<script>alert(1)</script>';
    const html = buildFixPlanHtmlReport(scan, { appVersion: 'test' });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
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
