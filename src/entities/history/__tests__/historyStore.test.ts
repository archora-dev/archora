import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useHistoryStore } from '../model/historyStore';
import { createBrowserSnapshotRepository } from '../model/browserSnapshotRepository';
import { setSnapshotRepositoryForTesting } from '../model/snapshotRepository';
import type { ScanResult } from '@/core/analyzer/types';

function makeScan(id: string, scannedAt: string, modulesCount = 1): ScanResult {
  return {
    project: { id, name: id, rootPath: '/' + id, detectedFramework: 'unknown' },
    modules: Array.from({ length: modulesCount }, (_, i) => ({
      id: `${id}/m${i}`,
      absPath: `/${id}/m${i}`,
      kind: 'util',
      language: 'ts',
      loc: 1,
      exports: [],
      isInfra: false,
    })),
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
  };
}

describe('historyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    setSnapshotRepositoryForTesting(createBrowserSnapshotRepository());
  });

  it('adds snapshots and lists newest first', async () => {
    const h = useHistoryStore();
    await h.add(makeScan('p', '2026-01-01T00:00:00Z'));
    await h.add(makeScan('p', '2026-01-02T00:00:00Z'));
    const list = h.forProject('p');
    expect(list).toHaveLength(2);
    expect(list[0]?.scannedAt).toBe('2026-01-02T00:00:00Z');
  });

  it('caps per-project history at 10', async () => {
    const h = useHistoryStore();
    for (let i = 0; i < 15; i++) {
      await h.add(makeScan('p', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
    }
    expect(h.forProject('p')).toHaveLength(10);
  });

  it('deduplicates same scannedAt', async () => {
    const h = useHistoryStore();
    await h.add(makeScan('p', '2026-01-01T00:00:00Z'));
    await h.add(makeScan('p', '2026-01-01T00:00:00Z'));
    expect(h.forProject('p')).toHaveLength(1);
  });

  it('persists across pinia instances (via repo + init)', async () => {
    const repo = createBrowserSnapshotRepository();
    setSnapshotRepositoryForTesting(repo);
    const h1 = useHistoryStore();
    await h1.add(makeScan('p', '2026-01-01T00:00:00Z'));

    setActivePinia(createPinia());
    setSnapshotRepositoryForTesting(repo);
    const h2 = useHistoryStore();
    await h2.init('p');
    expect(h2.forProject('p')).toHaveLength(1);
  });

  it('clearProject removes only that project', async () => {
    const h = useHistoryStore();
    await h.add(makeScan('p1', '2026-01-01T00:00:00Z'));
    await h.add(makeScan('p2', '2026-01-01T00:00:00Z'));
    await h.clearProject('p1');
    expect(h.forProject('p1')).toHaveLength(0);
    expect(h.forProject('p2')).toHaveLength(1);
  });

  it('does not throw when repository add fails', async () => {
    const failingRepo = createBrowserSnapshotRepository();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    setSnapshotRepositoryForTesting(failingRepo);
    const h = useHistoryStore();
    await expect(h.add(makeScan('p', '2026-01-01T00:00:00Z'))).resolves.not.toThrow();
    vi.restoreAllMocks();
  });
});
