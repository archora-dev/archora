<script setup lang="ts" generic="T">
import { computed } from 'vue';
import {
  ArchDataTable,
  type ArchDataTableColumn,
  type ArchDataTableRow,
  type ArchDataTableSortDirection,
} from '@archora/ui';
import StatusState from './StatusState.vue';

// Shared dense table surface for analyzer tabs. Ownership of scroll stays
// inside the wrapper (Epic 1: workspace must not produce page-level scroll),
// header stays sticky, sort state surfaces as a visible indicator and empty
// states use StatusState so the visual language matches across screens.
export type SortDirection = 'asc' | 'desc';

export interface DataTableSort {
  id: string;
  direction: SortDirection;
}

export interface DataTableColumn {
  id: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  minWidth?: string;
  sortable?: boolean;
  class?: string;
  srOnlyLabel?: boolean;
}

interface Props<U> {
  columns: readonly DataTableColumn[];
  rows: readonly U[];
  keyFn: (row: U, index: number) => string | number;
  sort?: DataTableSort | null;
  selectedKey?: string | number | null;
  compact?: boolean;
  stickyHeader?: boolean;
  loading?: boolean;
  // Shown when rows.length === 0. If emptyFiltered is true we render the
  // "no results after filters" variant instead of the plain empty state.
  emptyTitle?: string;
  emptyDescription?: string;
  emptyFiltered?: boolean;
}

const props = withDefaults(defineProps<Props<T>>(), {
  sort: null,
  selectedKey: null,
  compact: false,
  stickyHeader: true,
  loading: false,
  emptyFiltered: false,
});

const emit = defineEmits<{
  'update:sort': [sort: DataTableSort];
  'row-click': [row: T, index: number];
}>();

defineSlots<{
  [slot: `cell-${string}`]: (props: { row: T; index: number }) => unknown;
  [slot: `header-${string}`]: (props: { column: DataTableColumn }) => unknown;
  footer(): unknown;
}>();

const archColumns = computed<ArchDataTableColumn[]>(() =>
  props.columns.map((column) => {
    const archColumn: ArchDataTableColumn = {
      key: column.id,
      label: column.label,
      align: mapAlign(column),
    };

    if (column.width) archColumn.width = column.width;
    if (column.minWidth) archColumn.minWidth = column.minWidth;
    if (column.sortable !== undefined) archColumn.sortable = column.sortable;

    return archColumn;
  }),
);

const archRows = computed(() => props.rows as ArchDataTableRow[]);
const selectedRowKey = computed(() => props.selectedKey ?? null);
const stickyHeaderValue = computed(() => props.stickyHeader ?? true);
const sortBy = computed(() => props.sort?.id);
const sortDirection = computed(() => props.sort?.direction);
const sortProps = computed(() => {
  const tableSort: { sortBy?: string; sortDirection?: ArchDataTableSortDirection } = {};
  if (sortBy.value) tableSort.sortBy = sortBy.value;
  if (sortDirection.value) tableSort.sortDirection = sortDirection.value;
  return tableSort;
});
const loadingRows = computed(() => props.loading && props.rows.length === 0);
const emptyTitleText = computed(
  () =>
    props.emptyTitle ??
    (props.emptyFiltered ? 'No results match the current filters' : 'Nothing to show'),
);

function mapAlign(column: DataTableColumn): NonNullable<ArchDataTableColumn['align']> {
  switch (column.align) {
    case 'right':
      return 'end';
    case 'center':
      return 'center';
    default:
      return 'start';
  }
}

function updateSortBy(columnId: string): void {
  const current = props.sort;
  const direction =
    current && current.id === columnId && current.direction === 'desc' ? 'asc' : 'desc';
  emit('update:sort', { id: columnId, direction });
}

function updateSortDirection(direction: SortDirection): void {
  const columnId = props.sort?.id;
  if (!columnId) return;
  emit('update:sort', { id: columnId, direction });
}

function emitRowClick(row: ArchDataTableRow, index: number): void {
  emit('row-click', row as T, index);
}
</script>

<template>
  <ArchDataTable
    class="data-table"
    :columns="archColumns"
    :rows="archRows"
    :key-fn="(row, index) => keyFn(row as T, index)"
    :selected-key="selectedRowKey"
    v-bind="sortProps"
    initial-sort-direction="desc"
    :density="compact ? 'compact' : 'comfortable'"
    :sticky-header="stickyHeaderValue"
    :loading="loadingRows"
    :empty-text="emptyTitleText"
    @update:sort-by="updateSortBy"
    @update:sort-direction="updateSortDirection"
    @row-click="emitRowClick"
  >
    <template v-for="column in columns" :key="`header-${column.id}`" #[`header-${column.id}`]>
      <slot :name="`header-${column.id}`" :column="column">
        <span :class="column.srOnlyLabel ? 'sr-only' : ''">{{ column.label }}</span>
      </slot>
    </template>

    <template
      v-for="column in columns"
      :key="`cell-${column.id}`"
      #[`cell-${column.id}`]="{ row, rowIndex, value }"
    >
      <slot :name="`cell-${column.id}`" :row="row as T" :index="rowIndex">
        {{ value }}
      </slot>
    </template>

    <template #empty>
      <StatusState
        :variant="emptyFiltered ? 'no-results' : 'empty'"
        :title="emptyTitleText"
        v-bind="emptyDescription ? { description: emptyDescription } : {}"
      />
    </template>

    <template #loading>
      <StatusState variant="loading" title="Loading…" />
    </template>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </ArchDataTable>
</template>
