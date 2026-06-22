import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Badge from '../Badge.vue';

describe('Badge', () => {
  it('keeps the legacy tone API for existing call sites', () => {
    const w = mount(Badge, {
      props: { tone: 'warning' },
      slots: { default: 'cycles' },
    });
    expect(w.text()).toBe('cycles');
    expect(w.classes()).toContain('arch-badge--warning');
  });

  it('maps severity to a tone so analyzer screens share one scale', () => {
    const w = mount(Badge, {
      props: { severity: 'critical' },
      slots: { default: 'cycle' },
    });
    expect(w.classes()).toContain('arch-badge--danger');
  });

  it('renders a +N overflow instead of a slot when count is set', () => {
    const w = mount(Badge, {
      props: { count: 3 },
      slots: { default: 'ignored' },
    });
    expect(w.text()).toBe('+3');
  });

  it('keeps solid and outline props compatible with existing call sites', () => {
    const solid = mount(Badge, { props: { tone: 'danger', variant: 'solid' } });
    expect(solid.classes()).toContain('arch-badge--danger');
    const outline = mount(Badge, { props: { tone: 'primary', variant: 'outline' } });
    expect(outline.classes()).toContain('arch-badge--primary');
  });
});
