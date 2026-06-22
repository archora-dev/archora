import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Finding } from '@/entities/finding';

beforeEach(() => setActivePinia(createPinia()));

const isTauri = vi.fn(() => false);
vi.mock('@/shared/lib', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib')>('@/shared/lib');
  return { ...actual, isTauri: () => isTauri() };
});

const openInEditor = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/features/open-in-editor', () => ({
  openInEditor: (input: unknown) => openInEditor(input),
}));

import FindingDetail from './FindingDetail.vue';

const cycleFinding: Finding = {
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
};

describe('FindingDetail', () => {
  it('shows an empty prompt when nothing is selected', () => {
    const w = mount(FindingDetail, { props: { finding: null } });
    expect(w.find('[data-test="detail-empty"]').exists()).toBe(true);
  });

  it('renders the cycle evidence renderer for a cycle finding', () => {
    const w = mount(FindingDetail, {
      props: { finding: cycleFinding },
    });
    expect(w.find('[data-test="cycle-evidence"]').exists()).toBe(true);
  });

  it('headlines the suggested breakpoint as the concrete cut edge', () => {
    const finding: Finding = {
      ...cycleFinding,
      evidence: {
        kind: 'cycle',
        cycle: {
          id: 'cycle:1',
          modules: ['src/a.ts', 'src/b.ts'],
          length: 2,
          severity: 'direct',
          suggestedBreakpoint: { from: 'src/a.ts', to: 'src/b.ts' },
        },
      },
    };
    const w = mount(FindingDetail, { props: { finding } });
    const block = w.find('[data-test="cycle-breakpoint"]');
    expect(block.exists()).toBe(true);
    expect(block.text()).toContain('src/a.ts');
    expect(block.text()).toContain('src/b.ts');
    expect(w.find('[data-test="cycle-breakpoint-copy"]').exists()).toBe(true);
  });

  it('emits open-in-context with the finding so the page can route by type', async () => {
    const w = mount(FindingDetail, {
      props: { finding: cycleFinding },
    });
    await w.find('[data-test="open-in-context"]').trigger('click');
    expect(w.emitted('open-in-context')?.[0]).toEqual([cycleFinding]);
  });

  it('hides the open-in-editor action in the browser', () => {
    isTauri.mockReturnValue(false);
    const w = mount(FindingDetail, {
      props: { finding: cycleFinding, projectId: 'p' },
    });
    expect(w.find('[data-test="open-in-editor"]').exists()).toBe(false);
  });

  it('opens the located module in the editor when running under tauri', async () => {
    isTauri.mockReturnValue(true);
    openInEditor.mockClear();
    const w = mount(FindingDetail, {
      props: { finding: cycleFinding, projectId: 'demo' },
    });
    const button = w.find('[data-test="open-in-editor"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(openInEditor).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'demo', relativePath: 'a', command: 'code' }),
    );
  });
});
