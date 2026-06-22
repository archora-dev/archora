// File-system watcher integration. Tauri-only: starts/stops a Rust-side
// notify watcher, listens for `archora://fs-change` events, debounces
// bursts (IDE save-all), and re-runs the scan on the same FileSource.
//
// Browser FS Access API has no equivalent (File System Observer is still
// experimental in Chromium). We just no-op there and the user keeps using
// the manual Re-scan button.

import { isTauri, tauriInvoke, tauriListen } from '@/shared/lib';
import { useScanStore } from '@/entities/scan';

export interface FsChangePayload {
  watchId: string;
  paths: string[];
  at: number;
}

export interface WatchHandle {
  stop(): Promise<void>;
}

export interface StartWatchOptions {
  rootPath: string;
  /**
   * Called whenever a debounced batch of changes has been detected. The
   * callback is responsible for re-running the scan; this composable only
   * handles the OS-level plumbing.
   */
  onChange(paths: string[]): void;
  /**
   * JS-side coalescing window on top of Rust-side 200ms debouncer. 500ms
   * picked to absorb "save all open files" bursts in editors.
   */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE = 500;

export async function startWatching(opts: StartWatchOptions): Promise<WatchHandle | null> {
  if (!isTauri()) return null;
  const scan = useScanStore();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string[] = [];
  let watchId: string | null = null;

  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE;

  function flush(): void {
    timer = null;
    if (pending.length === 0) return;
    const batch = Array.from(new Set(pending));
    pending = [];
    opts.onChange(batch);
  }

  const off = await tauriListen<FsChangePayload>('archora://fs-change', (payload) => {
    if (!watchId || payload.watchId !== watchId) return;
    pending.push(...payload.paths);
    scan.noteChange(payload.at);
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });

  try {
    watchId = await tauriInvoke<string>('start_watch', { root: opts.rootPath });
  } catch (e) {
    off();
    throw e;
  }
  scan.setWatchActive(true);

  return {
    async stop(): Promise<void> {
      off();
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = [];
      const id = watchId;
      watchId = null;
      scan.setWatchActive(false);
      if (id !== null) {
        try {
          await tauriInvoke<void>('stop_watch', { watchId: id });
        } catch {
          // best-effort - watcher gets dropped on the Rust side anyway
        }
      }
    },
  };
}
