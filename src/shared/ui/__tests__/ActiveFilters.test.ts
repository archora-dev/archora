import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ActiveFilters from '../ActiveFilters.vue';

describe('ActiveFilters', () => {
  it('renders nothing when no filters are active', () => {
    const w = mount(ActiveFilters, {
      props: { filters: [] },
    });
    expect(['<!--v-if-->', '<!---->']).toContain(w.html());
  });

  it('emits remove for a chip click and reset for the reset button', async () => {
    const w = mount(ActiveFilters, {
      props: {
        filters: [
          { id: 'layer', label: 'Layer', value: 'features' },
          { id: 'severity', label: 'Severity', value: 'high' },
        ],
      },
    });
    const buttons = w.findAll('button');
    expect(buttons.length).toBe(3); // 2 chips + reset
    await buttons[0]!.trigger('click');
    expect(w.emitted('remove')?.[0]).toEqual(['layer']);
    await buttons[2]!.trigger('click');
    expect(w.emitted('reset')?.[0]).toEqual([]);
  });
});
