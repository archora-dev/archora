// Composable: ties the file-system watcher to the lifecycle of a project page.
// Starts watching when both (1) settings.watcher.autoRescan is on and
// (2) the current scan succeeded with a known root path; stops on unmount or
// when conditions flip. Triggers `runScanFlow` on debounced change batches.

import { onBeforeUnmount, ref, watchEffect } from 'vue';
import { isTauri, loadProjectLocator } from '@/shared/lib';
import { addDiagnostic } from '@/shared/lib/diagnostics';
import { endStartupSpan, markStartup, startStartupSpan } from '@/shared/lib/startupTiming';
import { useScanStore } from '@/entities/scan';
import { useProjectStore } from '@/entities/project';
import { useSettingsStore } from '@/entities/settings';
import { reopenProject } from '@/features/open-project';
import { runScanFlow } from './runScan';
import { startWatching, type WatchHandle } from './watchProject';

export function useProjectWatcher(): void {
  markStartup('project watcher setup');
  if (!isTauri()) {
    markStartup('project watcher skipped', 'not-tauri');
    return; // watcher is desktop-only
  }

  const scan = useScanStore();
  const project = useProjectStore();
  const settings = useSettingsStore();

  let handle: WatchHandle | null = null;
  let activeRoot: string | null = null;

  async function stop(): Promise<void> {
    if (handle) {
      startStartupSpan('project watcher stop');
      await handle.stop();
      endStartupSpan('project watcher stop');
      handle = null;
      activeRoot = null;
      addDiagnostic({
        scope: 'watcher',
        name: 'watcher stopped',
        level: 'info',
        data: { activeWatcherCount: 0 },
      });
    }
  }

  async function ensureRunning(rootPath: string): Promise<void> {
    if (handle && activeRoot === rootPath) return;
    await stop();
    activeRoot = rootPath;
    try {
      startStartupSpan('project watcher start');
      handle = await startWatching({
        rootPath,
        onChange: (paths) => {
          markStartup('project watcher changed', `${paths.length} paths`);
          addDiagnostic({
            scope: 'watcher',
            name: 'watcher changed',
            level: 'debug',
            data: { changedFiles: paths.length, lastWatcherEventAt: Date.now() },
          });
          void rescan(paths);
        },
      });
      endStartupSpan('project watcher start', rootPath);
      addDiagnostic({
        scope: 'watcher',
        name: 'watcher started',
        level: 'info',
        data: { activeWatcherCount: 1, rootPath },
      });
    } catch {
      endStartupSpan('project watcher start', 'failed');
      addDiagnostic({
        scope: 'watcher',
        name: 'watcher failed',
        level: 'warn',
        data: { activeWatcherCount: 0 },
      });
      // Watcher couldn't attach (e.g. project opened via FS Access in a previous
      // browser session - its «rootPath» is just a name, not an absolute path;
      // or the directory was unmounted). Nothing actionable for the user, the
      // manual «Re-scan» button still works. Stay silent and let the next
      // valid `ensureRunning` call try again.
      handle = null;
      activeRoot = null;
    }
  }

  async function rescan(changedPaths: string[]): Promise<void> {
    if (scan.isRunning) return;
    const cur = project.current;
    if (!cur) return;
    try {
      startStartupSpan('project watcher rescan');
      const picked = await reopenProject(cur.id);
      const prev = scan.result;
      // Incremental fast-path: only when we have a baseline AND the watcher
      // gave us a non-empty file list. The analyzer itself decides whether
      // the change set qualifies for fast-path or needs a full rescan.
      const incrementalFrom =
        prev && changedPaths.length > 0 ? { prev, changedFiles: changedPaths } : undefined;
      await runScanFlow({
        source: picked.source,
        locator: picked.locator,
        ...(incrementalFrom ? { incrementalFrom } : {}),
      });
      endStartupSpan('project watcher rescan', `${changedPaths.length} paths`);
      addDiagnostic({
        scope: 'watcher',
        name: 'watcher rescan finished',
        level: 'info',
        data: { changedFiles: changedPaths.length },
      });
    } catch {
      endStartupSpan('project watcher rescan', 'failed');
      addDiagnostic({
        scope: 'watcher',
        name: 'watcher rescan failed',
        level: 'warn',
        data: { changedFiles: changedPaths.length },
      });
      // best-effort; user can re-trigger the scan manually
    }
  }

  // The watcher needs an absolute filesystem path. `project.current.rootPath`
  // is **not** that - tauriFileSource intentionally returns `rootName` there
  // (used as a display label). We pull the absolute path from the persisted
  // locator instead, cached in `absRoot`.
  const absRoot = ref<string | null>(null);
  let resolvingFor: string | null = null;

  async function ensureAbsRootResolved(projectId: string): Promise<void> {
    if (resolvingFor === projectId) return;
    resolvingFor = projectId;
    try {
      startStartupSpan('project watcher locator resolve');
      const loc = await loadProjectLocator(projectId);
      if (resolvingFor !== projectId) return; // project switched while resolving
      if (loc?.kind === 'tauri' && isAbsolutePath(loc.path)) {
        absRoot.value = loc.path;
      } else {
        absRoot.value = null;
      }
      endStartupSpan('project watcher locator resolve', projectId);
    } catch {
      absRoot.value = null;
      endStartupSpan('project watcher locator resolve', 'failed');
    }
  }

  watchEffect(() => {
    const enabled = settings.settings.watcher.autoRescan;
    const cur = project.current;
    if (!enabled || !cur || scan.status !== 'done') {
      void stop();
      return;
    }
    if (resolvingFor !== cur.id) {
      absRoot.value = null;
      void ensureAbsRootResolved(cur.id);
    }
    const root = absRoot.value;
    if (root) {
      void ensureRunning(root);
    } else {
      void stop();
    }
  });

  onBeforeUnmount(() => {
    void stop();
  });
}

/**
 * Cheap guard against feeding the watcher a non-Tauri root: BrowserFsAccess
 * file source uses `rootName` (e.g. "microws-core") as `rootPath`, which would
 * make the Rust watcher resolve it relative to CWD and crash with «not a
 * directory». Only POSIX `/...` and Windows `C:\...` / `C:/...` are accepted.
 */
function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}
