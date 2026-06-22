import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { useToast } from '../toast/useToast';
import ToastHost from '../toast/ToastHost.vue';
import { nextTick } from 'vue';

describe('useToast', () => {
  it('pushes and dismisses toasts', async () => {
    const { push, dismiss, toasts } = useToast();
    const before = toasts.value.length;
    const id = push({ title: 'Hi', duration: 0 });
    expect(toasts.value.length).toBe(before + 1);
    dismiss(id);
    expect(toasts.value.find((t) => t.id === id)).toBeUndefined();
  });

  it('renders toasts in ToastHost', async () => {
    const { push, dismiss, toasts } = useToast();
    toasts.value.forEach((t) => dismiss(t.id));
    mount(ToastHost, { attachTo: document.body });
    push({ title: 'Saved', duration: 0 });
    await nextTick();
    expect(document.body.textContent).toContain('Saved');
  });
});
