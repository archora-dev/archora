import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Dropdown from '../Dropdown.vue';
import Menu from '../Menu.vue';

describe('Dropdown', () => {
  it('opens on trigger click and renders menu', async () => {
    const w = mount(Dropdown, {
      attachTo: document.body,
      slots: {
        trigger: '<span data-tt>open</span>',
        default: '<span>x</span>',
      },
    });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    await w.find('[data-tt]').trigger('click');
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    w.unmount();
  });
});

describe('Menu', () => {
  it('emits select on item click', async () => {
    const w = mount(Menu, {
      props: {
        items: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
      },
    });
    await w.findAll('[role="menuitem"]')[1]?.trigger('click');
    expect(w.emitted('select')?.[0]).toEqual(['b']);
  });
});
