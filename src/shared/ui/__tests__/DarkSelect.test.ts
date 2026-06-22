import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DarkSelect from '../DarkSelect.vue';

const options = [
  { value: 'overview', label: 'Overview' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'rules', label: 'Rules' },
];

describe('DarkSelect', () => {
  it('opens with keyboard arrows, highlights options and selects with Enter', async () => {
    const wrapper = mount(DarkSelect, {
      props: {
        modelValue: 'overview',
        options,
        dataTest: 'view-select',
      },
      attachTo: document.body,
    });

    await wrapper.get('[data-test="view-select"]').trigger('keydown', { key: 'ArrowDown' });

    expect(document.body.querySelector('[data-test="view-select-menu"]')).not.toBeNull();
    expect(document.body.querySelector('[role="option"][data-active="true"]')?.textContent).toBe(
      'Matrix',
    );

    await wrapper.get('[data-test="view-select"]').trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:modelValue')).toEqual([['matrix']]);
    expect(document.body.querySelector('[data-test="view-select-menu"]')).toBeNull();

    wrapper.unmount();
  });

  it('supports Space, Escape and outside click without using a native select', async () => {
    const wrapper = mount(DarkSelect, {
      props: {
        modelValue: 'overview',
        options,
        dataTest: 'view-select',
      },
      attachTo: document.body,
    });

    expect(wrapper.find('select').exists()).toBe(false);

    await wrapper.get('[data-test="view-select"]').trigger('keydown', { key: ' ' });
    expect(
      document.body.querySelector('[data-test="view-select-menu"]')?.getAttribute('role'),
    ).toBe('listbox');

    await wrapper.get('[data-test="view-select"]').trigger('keydown', { key: 'Escape' });
    expect(document.body.querySelector('[data-test="view-select-menu"]')).toBeNull();

    await wrapper.get('[data-test="view-select"]').trigger('click');
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-test="view-select-menu"]')).toBeNull();

    wrapper.unmount();
  });

  it('renders the chevron as an svg icon instead of a text marker', () => {
    const wrapper = mount(DarkSelect, {
      props: {
        modelValue: 'overview',
        options,
        dataTest: 'view-select',
      },
    });

    const trigger = wrapper.get('[data-test="view-select"]');

    expect(trigger.find('svg[aria-hidden="true"]').exists()).toBe(true);
    expect(trigger.text()).not.toContain('⌄');
  });
});
