import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { ScanResult } from '@/core/analyzer/types';
import { useScanStore } from '@/entities/scan';
import { useHistoryStore } from '@/entities/history';
import { createBrowserSnapshotRepository } from '@/entities/history/model/browserSnapshotRepository';
import { setSnapshotRepositoryForTesting } from '@/entities/history/model/snapshotRepository';
import HistoryView from './HistoryView.vue';

function scan(scannedAt: string): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 5,
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

describe('HistoryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    setSnapshotRepositoryForTesting(createBrowserSnapshotRepository());
  });

  it('lists snapshots and sets a baseline', async () => {
    const history = useHistoryStore();
    useScanStore().complete(scan('2026-06-20T10:00:00.000Z'));
    await history.add(scan('2026-06-20T10:00:00.000Z'));
    await history.init('p');
    const w = mount(HistoryView);
    await w.vm.$nextTick();
    await w.find('[data-test="set-baseline-2026-06-20T10:00:00.000Z"]').trigger('click');
    await w.vm.$nextTick();
    expect(history.baselineFor('p')).toBe('2026-06-20T10:00:00.000Z');
  });
});
