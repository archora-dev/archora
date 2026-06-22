import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Checkbox from '../Checkbox.vue';
import Switch from '../Switch.vue';

describe('Checkbox', () => {
  it('toggles modelValue', async () => {
    const w = mount(Checkbox, { props: { modelValue: false } });
    await w.find('input').setValue(true);
    expect(w.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('uses the ui-kit checkbox surface and keeps the label clickable', async () => {
    const w = mount(Checkbox, { props: { modelValue: false, label: 'Only cycles' } });

    expect(w.get('label').classes()).toContain('arch-checkbox');
    expect(w.get('input').attributes('type')).toBe('checkbox');

    await w.get('input').setValue(true);

    expect(w.emitted('update:modelValue')?.[0]).toEqual([true]);
  });
});

describe('Switch', () => {
  it('toggles via click and reflects aria-checked', async () => {
    const w = mount(Switch, { props: { modelValue: false } });
    const control = w.get('[role="switch"]');
    expect(control.attributes('aria-checked')).toBe('false');
    await control.trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('does not emit when disabled', async () => {
    const w = mount(Switch, { props: { modelValue: false, disabled: true } });
    await w.get('[role="switch"]').trigger('click');
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });
});
