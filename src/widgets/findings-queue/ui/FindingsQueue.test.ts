import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Finding } from '@/entities/finding';
import { useFindingTriageStore } from '@/entities/finding-triage';
import FindingsQueue from './FindingsQueue.vue';

const findings: Finding[] = [
  {
    id: 'cycle:1',
    type: 'cycle',
    severity: 'high',
    title: { i18nKey: 'entities.finding.cycle.title', params: { count: 2 } },
    modules: ['a', 'b'],
    location: 'a',
    beta: false,
    inChangeSet: false,
    evidence: {
      kind: 'cycle',
      cycle: { id: 'cycle:1', modules: ['a', 'b'], length: 2, severity: 'direct' },
    },
  },
];

function mountQueue(props: Record<string, unknown> = {}) {
  return mount(FindingsQueue, {
    props: { findings, selectedId: null, loading: false, ...props },
  });
}

describe('FindingsQueue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders a row per finding with its translated title', () => {
    const w = mountQueue();
    expect(w.find('[data-test="finding-cycle:1"]').exists()).toBe(true);
    expect(w.text()).toContain('Dependency cycle across 2 modules');
  });

  it('emits select on row click', async () => {
    const w = mountQueue();
    await w.find('[data-test="finding-cycle:1"]').trigger('click');
    expect(w.emitted('select')?.[0]).toEqual(['cycle:1']);
  });

  it('shows the empty state when there are no findings', () => {
    const w = mountQueue({ findings: [] });
    expect(w.find('[data-test="queue-empty"]').exists()).toBe(true);
  });

  it('renders a triaged finding muted with its state badge', () => {
    useFindingTriageStore().setState('p1', 'cycle:1', 'acknowledged');
    const w = mountQueue({ projectId: 'p1' });
    const row = w.find('[data-test="finding-cycle:1"]');
    expect(row.classes()).toContain('triaged');
    expect(w.find('[data-test="finding-triage-cycle:1"]').text()).toBe('Acknowledged');
  });

  it('shows no triage badge without a project id', () => {
    useFindingTriageStore().setState('p1', 'cycle:1', 'acknowledged');
    const w = mountQueue();
    expect(w.find('[data-test="finding-triage-cycle:1"]').exists()).toBe(false);
  });
});
