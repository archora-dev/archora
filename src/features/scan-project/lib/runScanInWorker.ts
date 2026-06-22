import type { FileSource } from '@/core/analyzer/fileSource';
import type { AnalyzeOptions } from '@/core/analyzer';
import type { ScanProgressCallback, ScanProgressEvent, ScanResult } from '@/core/analyzer/types';
import { addDiagnostic, diagnosticsEnabled } from '@/shared/lib/diagnostics';

// snapshot all files on main, ship to worker, run analyze() there.
// proxying FileSource over postMessage is too chatty (thousands of exists() calls).
export interface RunScanInWorkerOptions extends Omit<AnalyzeOptions, 'onProgress'> {
  onProgress?: ScanProgressCallback;
}

export async function runScanInWorker(
  source: FileSource,
  options: RunScanInWorkerOptions = {},
): Promise<ScanResult> {
  const { onProgress, ...analyzeOptions } = options;

  onProgress?.({ phase: 'discover' });
  const all = await source.list();
  const files: Record<string, string> = {};
  const perf = diagnosticsEnabled();
  const t0 = perf ? performance.now() : 0;
  // soft-fail per file
  if (source.readMany) {
    for (let i = 0; i < all.length; i += SNAPSHOT_READ_BATCH_SIZE) {
      const batch = all.slice(i, i + SNAPSHOT_READ_BATCH_SIZE);
      try {
        Object.assign(files, await source.readMany(batch));
      } catch {
        await mapLimit(batch, SNAPSHOT_READ_CONCURRENCY, async (rel) => {
          try {
            files[rel] = await source.read(rel);
          } catch {
            /* skip unreadable file */
          }
        });
      }
    }
  } else {
    await mapLimit(all, SNAPSHOT_READ_CONCURRENCY, async (rel) => {
      try {
        files[rel] = await source.read(rel);
      } catch {
        /* skip unreadable file */
      }
    });
  }
  // Out-of-band config files — `source.list()` is filtered to source code
  // extensions, but the worker's analyze() needs `.archora.json` to
  // apply contracts/layerOverrides/etc. Pull them in explicitly so the
  // snapshot mirrors what the in-process analyzer would see.
  await Promise.all(
    EXTRA_SNAPSHOT_FILES.map(async (rel) => {
      try {
        if (await source.exists(rel)) files[rel] = await source.read(rel);
      } catch {
        /* config absent or unreadable — fine */
      }
    }),
  );
  if (perf) {
    const dt = performance.now() - t0;
    addDiagnostic({
      scope: 'scan',
      name: 'worker snapshot read',
      level: 'debug',
      data: {
        filesDiscovered: all.length,
        projectTreeMs: Math.round(dt),
      },
    });
    if (diagnosticsEnabled()) {
      console.info(
        `[scan] read ${all.length} files in ${dt.toFixed(0)}ms (${(
          dt / Math.max(1, all.length)
        ).toFixed(2)}ms/file)`,
      );
    }
  }

  const worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });

  return new Promise<ScanResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: 'progress'; payload: ScanProgressEvent }
        | { type: 'done'; payload: ScanResult }
        | { type: 'error'; message: string };
      if (msg.type === 'progress') {
        onProgress?.(msg.payload);
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.payload);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Worker crashed'));
    };
    worker.postMessage({
      type: 'analyze',
      rootPath: source.rootPath,
      files,
      options: analyzeOptions,
    });
  });
}

// below this the in-thread analyzer is faster than snapshot + clone
export const WORKER_FILE_THRESHOLD = 2000;

// Keep Tauri IPC and browser file handles bounded. Unbounded Promise.all over
// 30k files can flood the invoke callback table and make reloads noisy/slow.
export const SNAPSHOT_READ_CONCURRENCY = 64;
export const SNAPSHOT_READ_BATCH_SIZE = 512;

// Configs analyzer reads outside of the source-listing path. Kept narrow
// on purpose — adding files here means they ride along on every snapshot.
export const EXTRA_SNAPSHOT_FILES = ['.archora.json', 'archora.json'] as const;

async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const item = items[cursor]!;
        cursor++;
        await fn(item);
      }
    }),
  );
}
