import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ScanResult } from '@/core/analyzer/types';
import { getSnapshotRepository } from './snapshotRepository';

export interface Snapshot {
  scannedAt: string; // ISO; also used as id
  projectId: string;
  scan: ScanResult;
}

type SnapshotMap = Record<string, Snapshot[]>;
type BaselineMap = Record<string, string | null>;

export const useHistoryStore = defineStore('history', () => {
  const byProject = ref<SnapshotMap>({});
  const baselines = ref<BaselineMap>({});

  const totalCount = computed(() =>
    Object.values(byProject.value).reduce((n, snaps) => n + snaps.length, 0),
  );

  function forProject(projectId: string): Snapshot[] {
    return byProject.value[projectId] ?? [];
  }

  function baselineFor(projectId: string): string | null {
    return baselines.value[projectId] ?? null;
  }

  async function init(projectId: string): Promise<void> {
    const repo = getSnapshotRepository();
    byProject.value = { ...byProject.value, [projectId]: await repo.list(projectId) };
    baselines.value = { ...baselines.value, [projectId]: await repo.getBaseline(projectId) };
  }

  async function add(scan: ScanResult): Promise<void> {
    const repo = getSnapshotRepository();
    const projectId = scan.project.id;
    await repo.add({ scannedAt: scan.scannedAt, projectId, scan });
    byProject.value = { ...byProject.value, [projectId]: await repo.list(projectId) };
  }

  async function remove(projectId: string, scannedAt: string): Promise<void> {
    const repo = getSnapshotRepository();
    await repo.remove(projectId, scannedAt);
    byProject.value = { ...byProject.value, [projectId]: await repo.list(projectId) };
  }

  async function clearProject(projectId: string): Promise<void> {
    const repo = getSnapshotRepository();
    await repo.clearProject(projectId);
    byProject.value = { ...byProject.value, [projectId]: [] };
    baselines.value = { ...baselines.value, [projectId]: null };
  }

  async function setBaseline(projectId: string, scannedAt: string): Promise<void> {
    const repo = getSnapshotRepository();
    await repo.setBaseline(projectId, scannedAt);
    baselines.value = { ...baselines.value, [projectId]: scannedAt };
  }

  async function clearBaseline(projectId: string): Promise<void> {
    const repo = getSnapshotRepository();
    await repo.clearBaseline(projectId);
    baselines.value = { ...baselines.value, [projectId]: null };
  }

  /** Reactive list of project IDs with at least one loaded snapshot. */
  const projectIds = computed(() => Object.keys(byProject.value));

  return {
    totalCount,
    projectIds,
    forProject,
    baselineFor,
    init,
    add,
    remove,
    clearProject,
    setBaseline,
    clearBaseline,
  };
});
