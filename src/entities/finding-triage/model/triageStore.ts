import { defineStore } from 'pinia';
import { reactive } from 'vue';

/** Triage decision a user applies to a finding. `'active'` means untriaged. */
export type TriageState = 'active' | 'acknowledged' | 'snoozed' | 'wont-fix';

export interface TriageEntry {
  state: Exclude<TriageState, 'active'>;
  reason?: string;
  /** ISO timestamp of the last decision. */
  at: string;
}

/** Map of findingId → entry for a single project. */
type ProjectTriage = Record<string, TriageEntry>;

function storageKey(projectId: string): string {
  return `archora:triage:${projectId}`;
}

function load(projectId: string): ProjectTriage {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return sanitize(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

function sanitize(input: Record<string, unknown>): ProjectTriage {
  const out: ProjectTriage = {};
  for (const [findingId, value] of Object.entries(input)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const state = entry.state;
    if (state !== 'acknowledged' && state !== 'snoozed' && state !== 'wont-fix') continue;
    const at = typeof entry.at === 'string' ? entry.at : new Date().toISOString();
    out[findingId] = {
      state,
      at,
      ...(typeof entry.reason === 'string' && entry.reason.trim().length > 0
        ? { reason: entry.reason }
        : {}),
    };
  }
  return out;
}

function persist(projectId: string, triage: ProjectTriage): void {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(triage));
  } catch {
    /* noop - private mode / quota */
  }
}

export const useFindingTriageStore = defineStore('findingTriage', () => {
  // Lazily loaded per project so storage is read only on first access.
  const byProject = reactive(new Map<string, ProjectTriage>());

  function projectMap(projectId: string): ProjectTriage {
    let map = byProject.get(projectId);
    if (!map) {
      map = load(projectId);
      byProject.set(projectId, map);
    }
    return map;
  }

  /** Reactive accessor for a project's whole triage map; recompute consumers. */
  function forProject(projectId: string): ProjectTriage {
    return projectMap(projectId);
  }

  function entryFor(projectId: string, findingId: string): TriageEntry | undefined {
    return projectMap(projectId)[findingId];
  }

  function stateFor(projectId: string, findingId: string): TriageState {
    return projectMap(projectId)[findingId]?.state ?? 'active';
  }

  function setState(
    projectId: string,
    findingId: string,
    state: TriageState,
    reason?: string,
  ): void {
    if (state === 'active') {
      reactivate(projectId, findingId);
      return;
    }
    const map = projectMap(projectId);
    const trimmed = reason?.trim();
    map[findingId] = {
      state,
      at: new Date().toISOString(),
      ...(trimmed ? { reason: trimmed } : {}),
    };
    persist(projectId, map);
  }

  function reactivate(projectId: string, findingId: string): void {
    const map = projectMap(projectId);
    if (!(findingId in map)) return;
    delete map[findingId];
    persist(projectId, map);
  }

  return { forProject, entryFor, stateFor, setState, reactivate };
});
