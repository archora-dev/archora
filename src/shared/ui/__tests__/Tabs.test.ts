import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Tabs from '../Tabs.vue';

describe('Tabs', () => {
  it('emits update:modelValue on tab click', async () => {
    const w = mount(Tabs, {
      props: {
        modelValue: 'a',
        tabs: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    });
    await w.findAll('[role="tab"]')[1]?.trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['b']);
  });

  it('marks aria-selected for active', () => {
    const w = mount(Tabs, {
      props: {
        modelValue: 'b',
        tabs: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    });
    const tabs = w.findAll('[role="tab"]');
    expect(tabs[1]?.attributes('aria-selected')).toBe('true');
    expect(tabs[0]?.attributes('aria-selected')).toBe('false');
  });
});
