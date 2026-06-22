import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { FindingFilter, FindingSeverity, FindingType } from '@/entities/finding';

export type CockpitLens = 'everything' | 'changed';
export type CockpitMode = 'briefing' | 'queue';

export const useCockpitViewStore = defineStore('cockpitView', () => {
  const mode = ref<CockpitMode>('briefing');
  const lens = ref<CockpitLens>('everything');
  const types = ref<FindingType[]>([]);
  const severities = ref<FindingSeverity[]>([]);
  const includeBeta = ref(true);
  const showTriaged = ref(false);
  const selectedId = ref<string | null>(null);

  const filter = computed<FindingFilter>(() => {
    const result: FindingFilter = { includeBeta: includeBeta.value };
    if (types.value.length) result.types = [...types.value];
    if (severities.value.length) result.severities = [...severities.value];
    return result;
  });

  function setMode(next: CockpitMode): void {
    mode.value = next;
  }
  function setLens(next: CockpitLens): void {
    lens.value = next;
  }
  function toggleType(type: FindingType): void {
    types.value = types.value.includes(type)
      ? types.value.filter((t) => t !== type)
      : [...types.value, type];
  }
  function toggleSeverity(severity: FindingSeverity): void {
    severities.value = severities.value.includes(severity)
      ? severities.value.filter((s) => s !== severity)
      : [...severities.value, severity];
  }
  function setIncludeBeta(value: boolean): void {
    includeBeta.value = value;
  }
  function setShowTriaged(value: boolean): void {
    showTriaged.value = value;
  }
  function select(id: string | null): void {
    selectedId.value = id;
    if (id !== null) mode.value = 'queue';
  }
  function reset(): void {
    mode.value = 'briefing';
    lens.value = 'everything';
    types.value = [];
    severities.value = [];
    includeBeta.value = true;
    showTriaged.value = false;
    selectedId.value = null;
  }

  return {
    mode,
    lens,
    types,
    severities,
    includeBeta,
    showTriaged,
    selectedId,
    filter,
    setMode,
    setLens,
    toggleType,
    toggleSeverity,
    setIncludeBeta,
    setShowTriaged,
    select,
    reset,
  };
});
