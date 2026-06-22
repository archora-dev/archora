import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import LicenseGate from './LicenseGate.vue';

describe('LicenseGate', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('allows visual smoke runs in dev without changing stored license state', () => {
    window.history.pushState({}, '', '/?archoraVisualSmoke=1');

    const wrapper = mount(LicenseGate, {
      slots: { default: '<main data-test="protected-content">Workspace</main>' },
    });

    expect(wrapper.get('[data-test="protected-content"]').text()).toBe('Workspace');
    expect(localStorage.getItem('archora:license')).toBeNull();
  });
});
