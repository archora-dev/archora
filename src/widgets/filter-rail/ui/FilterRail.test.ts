import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FilterRail from './FilterRail.vue';

function mountRail(props: Record<string, unknown> = {}) {
  return mount(FilterRail, {
    props: {
      activeTypes: [],
      activeSeverities: [],
      includeBeta: true,
      countsByType: {
        cycle: 4,
        'layer-violation': 2,
        hotspot: 0,
        contract: 0,
        coupling: 0,
        memory: 1,
        'async-lifecycle': 0,
        setup: 0,
      },
      ...props,
    },
  });
}

describe('FilterRail', () => {
  it('renders a chip per type that has findings', () => {
    const w = mountRail();
    expect(w.find('[data-test="type-cycle"]').exists()).toBe(true);
    expect(w.find('[data-test="type-hotspot"]').exists()).toBe(false); // zero count
  });

  it('emits toggle-type on chip click', async () => {
    const w = mountRail();
    await w.find('[data-test="type-cycle"]').trigger('click');
    expect(w.emitted('toggle-type')?.[0]).toEqual(['cycle']);
  });

  it('emits update:includeBeta on the beta toggle', async () => {
    const w = mountRail();
    await w.find('[data-test="toggle-beta"]').trigger('click');
    expect(w.emitted('update:includeBeta')?.[0]).toEqual([false]);
  });
});
