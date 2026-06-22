import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import type { Snapshot } from '@/entities/history';
import { buildHistoryTrend } from './buildHistoryTrend';

function snap(scannedAt: string, grade: 'A' | 'C', cycles: number): Snapshot {
  const scan: ScanResult = {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: Array.from({ length: cycles }, (_, i) => ({
      id: `cycle:${i}`,
      modules: ['a', 'b'],
      length: 2,
      severity: 'direct',
    })),
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: grade === 'A' ? 5 : 40,
      grade,
      breakdown: { cycles, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt,
    durationMs: 1,
    warnings: [],
  };
  return { scannedAt, projectId: 'p', scan };
}

describe('buildHistoryTrend', () => {
  it('orders points oldest→newest with grade, debt, and counts', () => {
    const points = buildHistoryTrend([
      snap('2026-06-20T11:00:00.000Z', 'C', 2),
      snap('2026-06-20T10:00:00.000Z', 'A', 0),
    ]);
    expect(points.map((p) => p.scannedAt)).toEqual([
      '2026-06-20T10:00:00.000Z',
      '2026-06-20T11:00:00.000Z',
    ]);
    expect(points[1]).toMatchObject({ grade: 'C', debtScore: 40, cycleCount: 2, findingCount: 2 });
  });

  it('returns [] for no snapshots', () => {
    expect(buildHistoryTrend([])).toEqual([]);
  });
});
