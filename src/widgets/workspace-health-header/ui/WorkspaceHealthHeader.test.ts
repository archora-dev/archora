import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import WorkspaceHealthHeader from './WorkspaceHealthHeader.vue';

function mountHeader(props: Record<string, unknown> = {}) {
  return mount(WorkspaceHealthHeader, {
    props: {
      grade: 'B',
      total: 7,
      lens: 'everything',
      hasBaseline: true,
      scannedAt: '2026-06-20T10:00:00.000Z',
      countsByType: {
        cycle: 4,
        'layer-violation': 2,
        hotspot: 1,
        contract: 0,
        coupling: 0,
        memory: 0,
        'async-lifecycle': 0,
        setup: 0,
      },
      ...props,
    },
  });
}

describe('WorkspaceHealthHeader', () => {
  it('renders the grade and total', () => {
    const w = mountHeader();
    expect(w.text()).toContain('B');
    expect(w.text()).toContain('7');
  });

  it('emits update:lens when the segmented control changes', async () => {
    const w = mountHeader();
    await w.find('[data-test="lens-changed"]').trigger('click');
    expect(w.emitted('update:lens')?.[0]).toEqual(['changed']);
  });

  it('disables the Changed lens when there is no baseline', () => {
    const w = mountHeader({ hasBaseline: false });
    expect(w.find('[data-test="lens-changed"]').attributes('disabled')).toBeDefined();
  });
});
