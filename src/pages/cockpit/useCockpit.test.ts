import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ScanResult } from '@/core/analyzer/types';
import { useScanStore } from '@/entities/scan';
import { useCockpitViewStore } from '@/features/cockpit-view';
import { useCockpit } from './useCockpit';

function scan(): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [{ id: 'cycle:1', modules: ['a', 'b'], length: 2, severity: 'direct' }],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 20,
      grade: 'C',
      breakdown: { cycles: 1, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: 't1',
    durationMs: 1,
    warnings: [],
  };
}

describe('useCockpit', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('returns null result before a scan completes', () => {
    const { result } = useCockpit();
    expect(result.value).toBeNull();
  });

  it('derives findings from the completed scan', () => {
    useScanStore().complete(scan());
    const { result } = useCockpit();
    expect(result.value?.grade).toBe('C');
    expect(result.value?.countsByType.cycle).toBe(1);
  });

  it('reacts to lens and filter changes', () => {
    useScanStore().complete(scan());
    const view = useCockpitViewStore();
    const { result } = useCockpit();
    view.toggleType('hotspot'); // no hotspots → empties the list
    expect(result.value?.total).toBe(0);
  });

  it('updates when a new scan completes (watcher path)', () => {
    const store = useScanStore();
    store.complete(scan());
    const { result } = useCockpit();
    expect(result.value?.total).toBe(1);
    const next = scan();
    next.cycles = [];
    next.archDebt = {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    };
    store.complete(next);
    expect(result.value?.total).toBe(0);
    expect(result.value?.grade).toBe('A');
  });
});
