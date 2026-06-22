import { describe, expect, it } from 'vitest';
import { buildHtmlReport } from '../buildHtmlReport';
import type { ScanResult } from '@/core/analyzer/types';

describe('buildHtmlReport', () => {
  it('exports an analyzer-first report without graph runtime markup', () => {
    const html = buildHtmlReport(scanFixture(), {
      exportedAt: '2026-05-11T00:00:00.000Z',
      appVersion: 'test',
    });

    expect(html).toContain('What to fix first');
    expect(html).toContain('Repair brief');
    expect(html).toContain('Verification plan');
    expect(html).toContain('Run Impact on the top hotspot');
    expect(html).toContain('Hot zones');
    expect(html).toContain('Rule violations');
    expect(html).toContain('src/shared/api.ts');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('id="graph"');
    expect(html).not.toContain('circle class="node"');
    expect(html).not.toContain('pan/zoom');
  });
});

function scanFixture(): ScanResult {
  return {
    project: { id: 'demo', name: 'demo', rootPath: '/repo/demo', detectedFramework: 'vue' },
    modules: [
      moduleNode('src/shared/api.ts'),
      moduleNode('src/features/auth.ts'),
      moduleNode('src/app/main.ts'),
    ],
    edges: [
      {
        from: 'src/shared/api.ts',
        to: 'src/features/auth.ts',
        kind: 'static',
        specifier: '../features/auth',
        resolved: true,
      },
    ],
    cycles: [
      {
        id: 'cycle:auth',
        modules: ['src/shared/api.ts', 'src/features/auth.ts'],
        length: 2,
        severity: 'direct',
      },
    ],
    metrics: {
      'src/shared/api.ts': {
        fanIn: 18,
        fanOut: 4,
        instability: 0.18,
        depth: 1,
        inCycle: true,
        couplingScore: 32,
        hotnessScore: 6.4,
      },
      'src/features/auth.ts': {
        fanIn: 8,
        fanOut: 9,
        instability: 0.52,
        depth: 2,
        inCycle: true,
        couplingScore: 18,
        hotnessScore: 3.1,
      },
      'src/app/main.ts': {
        fanIn: 0,
        fanOut: 2,
        instability: 1,
        depth: 0,
        inCycle: false,
        couplingScore: 2,
        hotnessScore: 0.2,
      },
    },
    hotZones: ['src/shared/api.ts'],
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
      score: 54,
      grade: 'D',
      breakdown: { cycles: 20, layerViolations: 20, hotZones: 10, coupling: 4 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-05-10T00:00:00.000Z',
    durationMs: 12,
    warnings: [],
  };
}

function moduleNode(id: string): ScanResult['modules'][number] {
  return {
    id,
    absPath: `/repo/demo/${id}`,
    kind: 'unknown',
    language: 'ts',
    loc: 20,
    exports: [],
    isInfra: false,
  };
}
