import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const STORAGE_KEY = 'fs:export-history:v1';
const LIMIT_PER_PROJECT = 20;

export interface ExportHistoryRecord {
  id: string;
  projectId: string;
  projectName: string;
  exportedAt: string;
  scope: 'full' | 'fix-plan';
  format: 'json' | 'html';
  fileName: string;
  path?: string;
}

type ExportHistoryMap = Record<string, ExportHistoryRecord[]>;

function isSupportedRecord(record: ExportHistoryRecord): boolean {
  return record.scope === 'full' || record.scope === 'fix-plan';
}

function loadAll(): ExportHistoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const data = parsed as ExportHistoryMap;
      return Object.fromEntries(
        Object.entries(data).map(([projectId, records]) => [
          projectId,
          Array.isArray(records) ? records.filter(isSupportedRecord) : [],
        ]),
      );
    }
  } catch {
    /* noop */
  }
  return {};
}

function saveAll(data: ExportHistoryMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* noop */
  }
}

function recordId(record: Omit<ExportHistoryRecord, 'id'>): string {
  return `${record.projectId}:${record.exportedAt}:${record.scope}:${record.format}`;
}

export const useExportHistoryStore = defineStore('exportHistory', () => {
  const data = ref<ExportHistoryMap>(loadAll());

  const totalCount = computed(() =>
    Object.values(data.value).reduce((count, records) => count + records.length, 0),
  );

  function forProject(projectId: string): ExportHistoryRecord[] {
    return [...(data.value[projectId] ?? [])].sort((a, b) =>
      b.exportedAt.localeCompare(a.exportedAt),
    );
  }

  function add(input: Omit<ExportHistoryRecord, 'id'>): ExportHistoryRecord {
    const record = { ...input, id: recordId(input) };
    const existing = data.value[input.projectId] ?? [];
    const next = [record, ...existing.filter((item) => item.id !== record.id)].slice(
      0,
      LIMIT_PER_PROJECT,
    );
    data.value = { ...data.value, [input.projectId]: next };
    saveAll(data.value);
    return record;
  }

  function clearProject(projectId: string): void {
    if (!(projectId in data.value)) return;
    const next = { ...data.value };
    delete next[projectId];
    data.value = next;
    saveAll(data.value);
  }

  return {
    data,
    totalCount,
    forProject,
    add,
    clearProject,
  };
});
