import { isTauri } from '@/shared/lib';
import packageJson from '../../../../package.json';
import type { Snapshot } from './historyStore';

export const LIMIT_PER_PROJECT = 10;

export interface SnapshotRepository {
  list(projectId: string): Promise<Snapshot[]>;
  add(snapshot: Snapshot): Promise<void>;
  remove(projectId: string, scannedAt: string): Promise<void>;
  clearProject(projectId: string): Promise<void>;
  getBaseline(projectId: string): Promise<string | null>;
  setBaseline(projectId: string, scannedAt: string): Promise<void>;
  clearBaseline(projectId: string): Promise<void>;
}

let cached: SnapshotRepository | null = null;

// Lazy Tauri proxy: resolves the real Tauri repository on first method call,
// keeping the SQL import out of the browser bundle path.
function makeTauriProxy(): SnapshotRepository {
  let resolved: SnapshotRepository | null = null;
  const resolveOnce = async (): Promise<SnapshotRepository> => {
    if (resolved) return resolved;
    const { createTauriSnapshotRepository } = await import('./tauriSnapshotRepository');
    resolved = createTauriSnapshotRepository(packageJson.version);
    return resolved;
  };
  return {
    async list(projectId) {
      return (await resolveOnce()).list(projectId);
    },
    async add(snapshot) {
      return (await resolveOnce()).add(snapshot);
    },
    async remove(projectId, scannedAt) {
      return (await resolveOnce()).remove(projectId, scannedAt);
    },
    async clearProject(projectId) {
      return (await resolveOnce()).clearProject(projectId);
    },
    async getBaseline(projectId) {
      return (await resolveOnce()).getBaseline(projectId);
    },
    async setBaseline(projectId, scannedAt) {
      return (await resolveOnce()).setBaseline(projectId, scannedAt);
    },
    async clearBaseline(projectId) {
      return (await resolveOnce()).clearBaseline(projectId);
    },
  };
}

export function getSnapshotRepository(): SnapshotRepository {
  if (cached) return cached;
  if (isTauri()) {
    cached = makeTauriProxy();
  } else {
    // Browser build: createBrowserSnapshotRepository is sync-constructible;
    // dynamic import is not needed here but ESM requires it (no require()).
    // We initialise synchronously via a module-level import below.
    cached = createBrowserRepositorySync();
  }
  return cached;
}

// Sync browser factory — avoids a dynamic import() in the hot path.
// The browser module has no side-effects so importing at module level is safe.
import { createBrowserSnapshotRepository } from './browserSnapshotRepository';

function createBrowserRepositorySync(): SnapshotRepository {
  return createBrowserSnapshotRepository();
}

/** Test seam: force a repository (e.g. the browser one in unit tests). */
export function setSnapshotRepositoryForTesting(repo: SnapshotRepository | null): void {
  cached = repo;
}
