import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DataTable from '../DataTable.vue';

interface Row {
  id: string;
  path: string;
  risk: number;
}

const columns = [
  { id: 'path', label: 'Path', sortable: true },
  { id: 'risk', label: 'Risk', align: 'right' as const, sortable: true },
  { id: 'action', label: 'Action' },
] as const;

describe('DataTable', () => {
  it('renders rows and keeps a sticky header row', () => {
    const rows: Row[] = [
      { id: 'a', path: 'src/a.ts', risk: 12 },
      { id: 'b', path: 'src/b.ts', risk: 84 },
    ];
    const w = mount(DataTable<Row>, {
      props: { columns, rows, keyFn: (r: Row) => r.id },
    });
    expect(w.findAll('tbody tr')).toHaveLength(2);
    expect(w.find('.arch-data-table').classes()).toContain('arch-data-table--sticky-header');
  });

  it('emits update:sort with desc then asc when the same column is toggled', async () => {
    const rows: Row[] = [{ id: 'a', path: 'src/a.ts', risk: 12 }];
    const w = mount(DataTable<Row>, {
      props: { columns, rows, keyFn: (r: Row) => r.id },
    });
    const riskHeader = w.findAll('thead button')[1];
    expect(riskHeader).toBeDefined();
    await riskHeader!.trigger('click');
    expect(w.emitted('update:sort')?.[0]).toEqual([{ id: 'risk', direction: 'desc' }]);

    await w.setProps({ sort: { id: 'risk', direction: 'desc' } });
    await riskHeader!.trigger('click');
    expect(w.emitted('update:sort')?.[1]).toEqual([{ id: 'risk', direction: 'asc' }]);
  });

  it('renders the filtered no-results state when rows are empty and emptyFiltered is set', () => {
    const w = mount(DataTable<Row>, {
      props: {
        columns,
        rows: [],
        keyFn: (r: Row) => r.id,
        emptyFiltered: true,
      },
    });
    expect(w.text()).toContain('No results match the current filters');
  });

  it('falls back to the plain empty state when no filters are active', () => {
    const w = mount(DataTable<Row>, {
      props: { columns, rows: [], keyFn: (r: Row) => r.id },
    });
    expect(w.text()).toContain('Nothing to show');
  });
});
