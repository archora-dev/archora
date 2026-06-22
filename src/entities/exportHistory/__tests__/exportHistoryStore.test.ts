import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useExportHistoryStore } from '../model/exportHistoryStore';

describe('exportHistoryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('persists exported reports per project newest first', () => {
    const store = useExportHistoryStore();
    store.add({
      projectId: 'demo',
      projectName: 'demo',
      exportedAt: '2026-05-11T10:00:00.000Z',
      scope: 'full',
      format: 'json',
      fileName: 'archora-demo-report.json',
    });
    store.add({
      projectId: 'demo',
      projectName: 'demo',
      exportedAt: '2026-05-11T11:00:00.000Z',
      scope: 'fix-plan',
      format: 'json',
      fileName: 'archora-demo-fix-plan.json',
    });

    expect(store.forProject('demo').map((item) => item.scope)).toEqual(['fix-plan', 'full']);

    setActivePinia(createPinia());
    expect(useExportHistoryStore().forProject('demo')).toHaveLength(2);
  });
});
