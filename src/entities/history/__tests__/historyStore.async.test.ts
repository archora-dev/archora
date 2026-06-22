import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ScanResult } from '@/core/analyzer/types';
import { useHistoryStore } from '../model/historyStore';
import { createBrowserSnapshotRepository } from '../model/browserSnapshotRepository';
import { setSnapshotRepositoryForTesting } from '../model/snapshotRepository';

function scan(projectId: string, scannedAt: string): ScanResult {
  return {
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
  };
}

describe('historyStore (repository-backed)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    setSnapshotRepositoryForTesting(createBrowserSnapshotRepository());
  });

  it('adds a scan and exposes it newest-first after init', async () => {
    const store = useHistoryStore();
    await store.add(scan('p', '2026-06-20T10:00:00.000Z'));
    await store.add(scan('p', '2026-06-20T11:00:00.000Z'));
    await store.init('p');
    expect(store.forProject('p').map((s) => s.scannedAt)).toEqual([
      '2026-06-20T11:00:00.000Z',
      '2026-06-20T10:00:00.000Z',
    ]);
  });

  it('persists and exposes a baseline pointer', async () => {
    const store = useHistoryStore();
    await store.add(scan('p', '2026-06-20T10:00:00.000Z'));
    await store.init('p');
    await store.setBaseline('p', '2026-06-20T10:00:00.000Z');
    expect(store.baselineFor('p')).toBe('2026-06-20T10:00:00.000Z');
  });
});
