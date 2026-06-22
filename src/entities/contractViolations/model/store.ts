import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useScanStore } from '@/entities/scan';
import type { ContractViolation } from '@/core/analyzer/types';

export type SeverityFilter = 'all' | 'error' | 'warning';
export type KindFilter = 'all' | ContractViolation['kind'];

export const useContractViolationsStore = defineStore('contractViolations', () => {
  const scan = useScanStore();

  // Stable id of the currently expanded violation, or null. UI uses this to
  // toggle the details row and to drive the graph focus.
  const selectedId = ref<string | null>(null);
  const severityFilter = ref<SeverityFilter>('all');
  const kindFilter = ref<KindFilter>('all');

  const all = computed<ContractViolation[]>(() => scan.result?.contractViolations ?? []);

  const filtered = computed<ContractViolation[]>(() => {
    let list = all.value;
    if (severityFilter.value !== 'all') {
      list = list.filter((v) => v.severity === severityFilter.value);
    }
    if (kindFilter.value !== 'all') {
      list = list.filter((v) => v.kind === kindFilter.value);
    }
    return list;
  });

  const counts = computed(() => {
    const acc = { total: all.value.length, error: 0, warning: 0 };
    for (const v of all.value) {
      if (v.severity === 'error') acc.error += 1;
      else acc.warning += 1;
    }
    return acc;
  });

  const kindsPresent = computed<ContractViolation['kind'][]>(() => {
    const set = new Set<ContractViolation['kind']>();
    for (const v of all.value) set.add(v.kind);
    return [...set];
  });

  function select(id: string | null): void {
    selectedId.value = selectedId.value === id ? null : id;
  }

  function setSeverityFilter(f: SeverityFilter): void {
    severityFilter.value = f;
  }

  function setKindFilter(f: KindFilter): void {
    kindFilter.value = f;
  }

  function reset(): void {
    selectedId.value = null;
    severityFilter.value = 'all';
    kindFilter.value = 'all';
  }

  return {
    selectedId,
    severityFilter,
    kindFilter,
    all,
    filtered,
    counts,
    kindsPresent,
    select,
    setSeverityFilter,
    setKindFilter,
    reset,
  };
});
