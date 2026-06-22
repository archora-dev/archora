import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CockpitHowto from './CockpitHowto.vue';

const STORAGE_KEY = 'archora.cockpit.howto.dismissed';

afterEach(() => localStorage.clear());

describe('CockpitHowto', () => {
  it('shows the hint when the flag is unset', () => {
    const w = mount(CockpitHowto);
    expect(w.find('[data-test="cockpit-howto"]').exists()).toBe(true);
  });

  it('dismisses and remembers via localStorage', async () => {
    const w = mount(CockpitHowto);
    await w.find('[data-test="howto-dismiss"]').trigger('click');
    expect(w.find('[data-test="cockpit-howto"]').exists()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('stays hidden when already dismissed', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    const w = mount(CockpitHowto);
    expect(w.find('[data-test="cockpit-howto"]').exists()).toBe(false);
  });
});
