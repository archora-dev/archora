import { beforeEach, describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import { createBrowserSnapshotRepository } from './browserSnapshotRepository';

function snap(projectId: string, scannedAt: string) {
  const scan = {
    project: { id: projectId, name: projectId, rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt,
    durationMs: 1,
    warnings: [],
  } as ScanResult;
  return { scannedAt, projectId, scan };
}

describe('browserSnapshotRepository', () => {
  beforeEach(() => localStorage.clear());

  it('adds and lists newest-first', async () => {
    const repo = createBrowserSnapshotRepository();
    await repo.add(snap('p', '2026-06-20T10:00:00.000Z'));
    await repo.add(snap('p', '2026-06-20T11:00:00.000Z'));
    const list = await repo.list('p');
    expect(list.map((s) => s.scannedAt)).toEqual([
      '2026-06-20T11:00:00.000Z',
      '2026-06-20T10:00:00.000Z',
    ]);
  });

  it('dedupes by scannedAt', async () => {
    const repo = createBrowserSnapshotRepository();
    await repo.add(snap('p', '2026-06-20T10:00:00.000Z'));
    await repo.add(snap('p', '2026-06-20T10:00:00.000Z'));
    expect(await repo.list('p')).toHaveLength(1);
  });

  it('caps at 10 per project, dropping oldest', async () => {
    const repo = createBrowserSnapshotRepository();
    for (let h = 0; h < 12; h += 1) {
      await repo.add(snap('p', `2026-06-20T${String(h).padStart(2, '0')}:00:00.000Z`));
    }
    const list = await repo.list('p');
    expect(list).toHaveLength(10);
    expect(list.at(-1)?.scannedAt).toBe('2026-06-20T02:00:00.000Z');
  });

  it('stores and reads a baseline pointer per project', async () => {
    const repo = createBrowserSnapshotRepository();
    await repo.add(snap('p', '2026-06-20T10:00:00.000Z'));
    await repo.setBaseline('p', '2026-06-20T10:00:00.000Z');
    expect(await repo.getBaseline('p')).toBe('2026-06-20T10:00:00.000Z');
    await repo.clearBaseline('p');
    expect(await repo.getBaseline('p')).toBeNull();
  });
});
