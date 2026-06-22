import type { FileSource } from '@/core/analyzer/fileSource';
import { loadArchoraConfig } from '@/core/config/frontScopeConfig';
import type { ScanProgressEvent, ScanResult } from '@/core/analyzer/types';
import { saveProjectLocator, type ProjectLocator } from '@/shared/lib';
import { endStartupSpan, markStartup, startStartupSpan } from '@/shared/lib/startupTiming';
import { addDiagnostic } from '@/shared/lib/diagnostics';
import { useProjectStore } from '@/entities/project';
import { useScanStore } from '@/entities/scan';
import { useHistoryStore } from '@/entities/history';
import { useSettingsStore } from '@/entities/settings';
import { runScanInWorker, WORKER_FILE_THRESHOLD } from './runScanInWorker';
import { loadGitHistory } from './loadGitHistory';

export async function runScan(source: FileSource): Promise<ScanResult> {
  const { runInlineAnalyze } = await import('./runInlineAnalyze');
  return runInlineAnalyze(source);
}

export interface ScanFlowInput {
  source: FileSource;
  locator?: ProjectLocator;
  // auto-picks worker when file count > WORKER_FILE_THRESHOLD
  runner?: 'auto' | 'inline' | 'worker';
  /**
   * When provided together with `changedFiles`, attempt an incremental rescan
   * against this baseline (typically the previous scan result). The analyzer
   * may transparently fall back to a full scan when the fast-path conditions
   * don't hold (config changes, added/deleted files, glob imports).
   */
  incrementalFrom?: { prev: ScanResult; changedFiles: string[] };
}

export async function runScanFlow(input: ScanFlowInput): Promise<ScanResult> {
  startStartupSpan('scan flow');
  performance.mark('archora:scan-start');
  markStartup('scan start');
  const project = useProjectStore();
  const scan = useScanStore();
  const history = useHistoryStore();
  const settings = useSettingsStore();
  // User-configured paths excluded from analysis (generated code, vendor, etc.).
  // Threaded into the analyzer as discovery ignore globs; `analyze()` merges
  // them with project `.archora.json` ignores. Applied on full scans here so a
  // re-scan reflects edits made on the Settings page.
  const ignoreGlobs = settings.settings.analysis.generatedPaths;
  const discover = ignoreGlobs.length > 0 ? { extraIgnoreGlobs: [...ignoreGlobs] } : undefined;

  scan.start();
  addDiagnostic({
    scope: 'scan',
    name: 'scan started',
    level: 'info',
    data: { activeScanCount: 1 },
  });
  try {
    startStartupSpan('scan worker decision');
    const useWorker = !input.incrementalFrom && (await shouldUseWorker(input));
    endStartupSpan('scan worker decision', `useWorker=${useWorker}`);
    const onProgress = (e: ScanProgressEvent): void => {
      scan.setProgress(e);
      addDiagnostic({
        scope: e.phase === 'parse' ? 'parser' : 'analyzer',
        name: e.phase === 'parse' ? 'parser progress' : 'analyzer progress',
        level: 'debug',
        data: {
          [`${e.phase === 'parse' ? 'parser' : 'analyzer'}Phase`]: e.phase,
          ...(typeof e.current === 'number'
            ? { [`${e.phase === 'parse' ? 'parser' : 'analyzer'}Current`]: e.current }
            : {}),
          ...(typeof e.total === 'number'
            ? { [`${e.phase === 'parse' ? 'parser' : 'analyzer'}Total`]: e.total }
            : {}),
        },
      });
    };
    // Resolve git history once for full scans. Best-effort: null means the
    // scan proceeds without churn/temporal-coupling metrics (non-git repos,
    // no git binary, browser context).
    const tauriRoot =
      !input.incrementalFrom && input.locator?.kind === 'tauri' ? input.locator.path : null;
    const gitHistory = tauriRoot ? await loadGitHistory(tauriRoot).catch(() => null) : null;

    let result: ScanResult;
    if (input.incrementalFrom) {
      startStartupSpan('incremental analyze');
      const { runIncrementalAnalyze } = await import('./runInlineAnalyze');
      result = await runIncrementalAnalyze({
        prev: input.incrementalFrom.prev,
        source: input.source,
        changedFiles: input.incrementalFrom.changedFiles,
      });
      endStartupSpan('incremental analyze', `${result.modules.length} modules`);
    } else if (useWorker) {
      startStartupSpan('worker analyze');
      result = await runScanInWorker(input.source, {
        onProgress,
        ...(gitHistory ? { gitHistory } : {}),
        ...(discover ? { discover } : {}),
      });
      endStartupSpan('worker analyze', `${result.modules.length} modules`);
    } else {
      startStartupSpan('inline analyze');
      const { runInlineAnalyze } = await import('./runInlineAnalyze');
      result = await runInlineAnalyze(input.source, {
        onProgress,
        ...(gitHistory ? { gitHistory } : {}),
        ...(discover ? { discover } : {}),
      });
      endStartupSpan('inline analyze', `${result.modules.length} modules`);
    }
    startStartupSpan('project store current update');
    project.setCurrent(result.project);
    endStartupSpan('project store current update', result.project.id);
    if (input.locator) {
      startStartupSpan('project locator save');
      await saveProjectLocator(result.project.id, input.locator).catch(() => undefined);
      endStartupSpan('project locator save');
    }
    // Mirror the on-disk `.archora.json` into the store. UI widgets that
    // need the existing contracts block (suggestions de-dup) consult this.
    // Best-effort - failure here doesn't fail the scan.
    try {
      startStartupSpan('archora config load');
      const cfg = await loadArchoraConfig(input.source);
      scan.setConfig(cfg);
      endStartupSpan('archora config load', cfg ? 'present' : 'null');
    } catch {
      scan.setConfig(null);
      endStartupSpan('archora config load', 'failed');
    }
    startStartupSpan('scan result store complete');
    // Record the excluded-path globs reflected in this result so the UI can
    // detect later edits. Incremental runs derive from the baseline and don't
    // re-apply discovery globs, so keep the baseline's applied set in that case.
    if (input.incrementalFrom) {
      scan.complete(result, scan.appliedIgnoreGlobs ?? ignoreGlobs);
    } else {
      scan.complete(result, ignoreGlobs);
    }
    performance.mark('archora:scan-complete');
    markStartup('scan complete', `${result.modules.length} modules`);
    endStartupSpan('scan result store complete');
    try {
      startStartupSpan('history add scan');
      await history.add(result); // best-effort
      await history.init(result.project.id);
      endStartupSpan('history add scan');
    } catch {
      endStartupSpan('history add scan', 'failed');
      /* noop */
    }
    endStartupSpan('scan flow', `${result.modules.length} modules`);
    addDiagnostic({
      scope: 'scan',
      name: 'scan finished',
      level: 'info',
      data: {
        activeScanCount: 0,
        filesAnalyzed: result.modules.length,
        parserWarningCount: result.warnings.filter((warning) =>
          /parse|parser|syntax/iu.test(warning.message),
        ).length,
        analyzerWarningCount: result.warnings.length,
        configDiagnosticCount: result.configDiagnostics?.length ?? 0,
        lastScanDurationMs: performance.now() - scan.startedAt,
      },
    });
    return result;
  } catch (e) {
    markStartup('scan flow failed', e instanceof Error ? e.message : String(e));
    endStartupSpan('scan flow', 'failed');
    addDiagnostic({
      scope: 'scan',
      name: 'scan failed',
      level: 'error',
      data: { activeScanCount: 0, message: e instanceof Error ? e.message : String(e) },
    });
    scan.fail(e);
    throw e;
  }
}

async function shouldUseWorker(input: ScanFlowInput): Promise<boolean> {
  if (typeof Worker === 'undefined') return false;
  const runner = input.runner ?? 'auto';
  if (runner === 'inline') return false;
  if (runner === 'worker') return true;
  try {
    const list = await input.source.list();
    return list.length > WORKER_FILE_THRESHOLD;
  } catch {
    return false;
  }
}
