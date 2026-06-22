import { describe, expect, it } from 'vitest';
import { buildDeadCodeReport } from '../buildDeadCodeReport';
import type { ScanResult } from '../../analyzer/types';

describe('buildDeadCodeReport', () => {
  it('returns candidates with correct groups and totalLoc, excluding non-qualifying modules', () => {
    const scan = scanFixture();
    const report = buildDeadCodeReport(scan);

    // entry-kind, live module (fanIn>0), and test file must be excluded
    const ids = report.candidates.map((c) => c.id);
    expect(ids).not.toContain('src/app/main.ts');
    expect(ids).not.toContain('src/features/active/model.ts');
    expect(ids).not.toContain('src/utils/parse.test.ts');

    // isolated source module and script-entry must be included
    expect(ids).toContain('src/legacy/orphan.ts');
    expect(ids).toContain('scripts/seed.mjs');

    // groups
    const orphan = report.candidates.find((c) => c.id === 'src/legacy/orphan.ts');
    expect(orphan?.group).toBe('isolated');
    expect(orphan?.loc).toBe(40);

    const script = report.candidates.find((c) => c.id === 'scripts/seed.mjs');
    expect(script?.group).toBe('script-entry');

    // counts
    expect(report.isolatedCount).toBe(1);
    expect(report.scriptEntryCount).toBe(1);
    expect(report.candidates).toHaveLength(2);

    // totalLoc = sum of candidate locs
    expect(report.totalLoc).toBe(40 + 8);

    // sorted by loc desc
    expect(report.candidates.map((c) => c.id)).toEqual([
      'src/legacy/orphan.ts',
      'scripts/seed.mjs',
    ]);
  });

  it('returns an empty report when no dead modules exist', () => {
    const report = buildDeadCodeReport({
      ...scanFixture(),
      modules: [mod('src/app/main.ts', 'entry', 20)],
      metrics: {},
    });
    expect(report.candidates).toHaveLength(0);
    expect(report.totalLoc).toBe(0);
    expect(report.isolatedCount).toBe(0);
    expect(report.scriptEntryCount).toBe(0);
  });
});

function scanFixture(): ScanResult {
  return {
    project: { id: 'test', name: 'test', rootPath: '/repo', detectedFramework: 'generic' },
    modules: [
      mod('src/app/main.ts', 'entry', 15),
      mod('src/features/active/model.ts', 'model', 30),
      mod('src/legacy/orphan.ts', 'module', 40),
      mod('scripts/seed.mjs', 'module', 8),
      mod('src/utils/parse.test.ts', 'test', 20),
    ],
    edges: [],
    cycles: [],
    metrics: {
      'src/app/main.ts': metric(1, 2),
      'src/features/active/model.ts': metric(3, 1),
      'src/legacy/orphan.ts': metric(0, 0),
      'scripts/seed.mjs': metric(0, 0),
      'src/utils/parse.test.ts': metric(0, 0),
    },
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-06-21T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
  };
}

function mod(
  id: string,
  kind: ScanResult['modules'][number]['kind'],
  loc: number,
): ScanResult['modules'][number] {
  return { id, absPath: `/repo/${id}`, kind, language: 'ts', loc, exports: [], isInfra: false };
}

function metric(fanIn: number, fanOut: number): ScanResult['metrics'][string] {
  return {
    fanIn,
    fanOut,
    instability: 0,
    depth: 0,
    inCycle: false,
    couplingScore: 0,
    hotnessScore: 0,
  };
}
