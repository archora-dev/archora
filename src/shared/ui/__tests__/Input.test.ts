import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Input from '../Input.vue';
import Textarea from '../Textarea.vue';

describe('Input', () => {
  it('emits update:modelValue on input', async () => {
    const w = mount(Input, { props: { modelValue: '' } });
    await w.find('input').setValue('hello');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['hello']);
  });

  it('reflects invalid prop with aria-invalid', () => {
    const w = mount(Input, { props: { invalid: true } });
    expect(w.find('input').attributes('aria-invalid')).toBe('true');
  });
});

describe('Textarea', () => {
  it('emits update:modelValue on input', async () => {
    const w = mount(Textarea, { props: { modelValue: '' } });
    await w.find('textarea').setValue('multi\nline');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['multi\nline']);
  });
});
