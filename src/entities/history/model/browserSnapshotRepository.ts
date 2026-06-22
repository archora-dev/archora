import type { Snapshot } from './historyStore';
import { LIMIT_PER_PROJECT, type SnapshotRepository } from './snapshotRepository';

const HISTORY_KEY = 'fs:history:v1';
const BASELINE_KEY = 'fs:baseline:v1';

type HistoryMap = Record<string, Snapshot[]>;
type BaselineMap = Record<string, string>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  let attempt = JSON.stringify(value);
  while (true) {
    try {
      localStorage.setItem(key, attempt);
      return;
    } catch {
      // Quota exceeded: drop the globally-oldest snapshot and retry.
      if (key !== HISTORY_KEY) return;
      const map = value as HistoryMap;
      const dropped = dropOldest(map);
      if (!dropped) return;
      attempt = JSON.stringify(map);
    }
  }
}

function dropOldest(map: HistoryMap): boolean {
  let oldestProject: string | null = null;
  let oldestAt = Infinity;
  for (const [pid, snaps] of Object.entries(map)) {
    for (const s of snaps) {
      const t = Date.parse(s.scannedAt);
      if (t < oldestAt) {
        oldestAt = t;
        oldestProject = pid;
      }
    }
  }
  if (!oldestProject) return false;
  const snapsForProject = map[oldestProject];
  if (!snapsForProject) return false;
  const filtered = snapsForProject.filter((s) => Date.parse(s.scannedAt) !== oldestAt);
  if (filtered.length === 0) delete map[oldestProject];
  else map[oldestProject] = filtered;
  return true;
}

export function createBrowserSnapshotRepository(): SnapshotRepository {
  return {
    async list(projectId) {
      const map = read<HistoryMap>(HISTORY_KEY, {});
      return [...(map[projectId] ?? [])].sort(
        (a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt),
      );
    },
    async add(snapshot) {
      const map = read<HistoryMap>(HISTORY_KEY, {});
      const existing = (map[snapshot.projectId] ?? []).filter(
        (s) => s.scannedAt !== snapshot.scannedAt,
      );
      const next = [...existing, snapshot]
        .sort((a, b) => Date.parse(a.scannedAt) - Date.parse(b.scannedAt))
        .slice(-LIMIT_PER_PROJECT);
      map[snapshot.projectId] = next;
      write(HISTORY_KEY, map);
    },
    async remove(projectId, scannedAt) {
      const map = read<HistoryMap>(HISTORY_KEY, {});
      if (!map[projectId]) return;
      map[projectId] = map[projectId].filter((s) => s.scannedAt !== scannedAt);
      if (map[projectId].length === 0) delete map[projectId];
      write(HISTORY_KEY, map);
    },
    async clearProject(projectId) {
      const map = read<HistoryMap>(HISTORY_KEY, {});
      delete map[projectId];
      write(HISTORY_KEY, map);
    },
    async getBaseline(projectId) {
      return read<BaselineMap>(BASELINE_KEY, {})[projectId] ?? null;
    },
    async setBaseline(projectId, scannedAt) {
      const map = read<BaselineMap>(BASELINE_KEY, {});
      map[projectId] = scannedAt;
      write(BASELINE_KEY, map);
    },
    async clearBaseline(projectId) {
      const map = read<BaselineMap>(BASELINE_KEY, {});
      delete map[projectId];
      write(BASELINE_KEY, map);
    },
  };
}
