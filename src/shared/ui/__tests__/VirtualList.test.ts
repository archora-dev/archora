import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import VirtualList from '../VirtualList.vue';

function makeItems(n: number): { id: number; label: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, label: `item-${i}` }));
}

interface HarnessProps {
  items: { id: number; label: string }[];
  itemHeight: number;
  height: number;
  overscan?: number;
}

const Harness = defineComponent<HarnessProps>(
  (props) => () =>
    h(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      VirtualList as any,
      {
        items: props.items,
        itemHeight: props.itemHeight,
        height: props.height,
        overscan: props.overscan ?? 5,
        keyFn: (it: { id: number }) => `k-${it.id}`,
      },
      {
        default: ({ item }: { item: { id: number; label: string } }) =>
          h('span', { class: 'row', 'data-id': item.id }, item.label),
      },
    ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { props: ['items', 'itemHeight', 'height', 'overscan'] as any },
);

describe('VirtualList', () => {
  it('renders only a window of items, not all 10000', async () => {
    const items = makeItems(10000);
    const w = mount(Harness, { props: { items, itemHeight: 24, height: 200, overscan: 2 } });
    await nextTick();
    const rows = w.findAll('.row');
    // ~9 visible + 2*overscan; definitely not 10000
    expect(rows.length).toBeLessThan(20);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[0]?.attributes('data-id')).toBe('0');
    w.unmount();
  });

  it('renders new window after scroll', async () => {
    const items = makeItems(1000);
    const w = mount(Harness, { props: { items, itemHeight: 20, height: 100, overscan: 1 } });
    await nextTick();
    const container = w.find('.arch-virtual-scroller');
    expect(container.exists()).toBe(true);
    // happy-dom doesn't simulate scroll properly - stub scrollTop via getter
    const el = container.element as HTMLElement;
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => 2000 });
    el.dispatchEvent(new Event('scroll'));
    await nextTick();
    const rows = w.findAll('.row');
    const ids = rows.map((r) => Number(r.attributes('data-id')));
    expect(Math.min(...ids)).toBeGreaterThan(50);
    w.unmount();
  });
});
