import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Modal from '../Modal.vue';

describe('Modal', () => {
  it('renders dialog when open', () => {
    const w = mount(Modal, {
      props: { open: true, title: 'T' },
      slots: { default: '<button>x</button>' },
      attachTo: document.body,
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    w.unmount();
  });

  it('emits close on Escape', async () => {
    const w = mount(Modal, { props: { open: true }, attachTo: document.body });
    document
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(w.emitted('close')).toHaveLength(1);
    expect(w.emitted('update:open')?.[0]).toEqual([false]);
    w.unmount();
  });
});
