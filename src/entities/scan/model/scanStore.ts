import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ScanPhase, ScanProgressEvent, ScanResult } from '@/core/analyzer/types';
import type { ArchoraConfig } from '@/core/config/frontScopeConfig';
import { markStartup } from '@/shared/lib/startupTiming';

export type ScanStatus = 'idle' | 'running' | 'done' | 'error';

export interface ScanProgress {
  phase: ScanPhase;
  current?: number;
  total?: number;
}

export const useScanStore = defineStore('scan', () => {
  markStartup('scan store init');
  const status = ref<ScanStatus>('idle');
  const result = ref<ScanResult | null>(null);
  const progress = ref<ScanProgress>({ phase: 'discover' });
  const startedAt = ref<number>(0);
  const error = ref<string | null>(null);
  // Loaded `.archora.json` for the current project (null when absent or on
  // older runs). Used by widgets that need the existing contracts block — e.g.
  // ContractSuggestions de-duplicates against it.
  const config = ref<ArchoraConfig | null>(null);

  // Analysis-affecting settings snapshot used for the current result: the
  // excluded-path globs that were applied when this scan ran. The Settings page
  // and cockpit compare it against the live settings to surface a "re-scan to
  // apply" prompt. Null until a full scan completes.
  const appliedIgnoreGlobs = ref<string[] | null>(null);

  // watcher state (15.2): controlled by useFileWatcher composable.
  const watchActive = ref<boolean>(false);
  const lastChangeAt = ref<number>(0);

  const isRunning = computed(() => status.value === 'running');

  function start(): void {
    markStartup('scan flow store start');
    status.value = 'running';
    result.value = null;
    error.value = null;
    progress.value = { phase: 'discover' };
    startedAt.value = performance.now();
  }

  function setConfig(cfg: ArchoraConfig | null): void {
    markStartup('scan config stored', cfg ? 'present' : 'null');
    config.value = cfg;
  }

  function setProgress(p: ScanProgressEvent): void {
    if (p.phase !== progress.value.phase) markStartup('scan progress phase', p.phase);
    progress.value = {
      phase: p.phase,
      ...(p.current !== undefined ? { current: p.current } : {}),
      ...(p.total !== undefined ? { total: p.total } : {}),
    };
  }

  function complete(r: ScanResult, ignoreGlobs: string[] = []): void {
    markStartup('scan flow store complete', `${r.modules.length} modules`);
    result.value = r;
    appliedIgnoreGlobs.value = [...ignoreGlobs];
    status.value = 'done';
    progress.value = { phase: 'done' };
  }

  function fail(err: unknown): void {
    error.value = err instanceof Error ? err.message : String(err);
    status.value = 'error';
  }

  function reset(): void {
    status.value = 'idle';
    result.value = null;
    error.value = null;
    startedAt.value = 0;
    config.value = null;
    appliedIgnoreGlobs.value = null;
  }

  function setWatchActive(active: boolean): void {
    watchActive.value = active;
  }
  function noteChange(at = Date.now()): void {
    lastChangeAt.value = at;
  }

  return {
    status,
    result,
    progress,
    startedAt,
    error,
    config,
    appliedIgnoreGlobs,
    watchActive,
    lastChangeAt,
    isRunning,
    start,
    setProgress,
    setConfig,
    complete,
    fail,
    reset,
    setWatchActive,
    noteChange,
  };
});
