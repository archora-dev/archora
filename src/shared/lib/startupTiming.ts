import { addDiagnostic, diagnosticsEnabled, installDiagnostics } from './diagnostics';

interface StartupEntry {
  label: string;
  elapsedFromNavigationStartMs: number;
  elapsedFromMainImportMs: number | null;
  elapsedFromAppMountMs: number | null;
  durationMs?: number;
  detail?: string;
}

type StartupWindow = Window & {
  __frontScopeMainImportAt?: number;
  __frontScopeAppMountAt?: number;
  __frontScopeStartupEntries?: StartupEntry[];
  __frontScopeStartupOpenSpans?: Record<string, number>;
};

function startupWindow(): StartupWindow | null {
  if (typeof window === 'undefined') return null;
  return window as StartupWindow;
}

function isStartupTimingEnabled(): boolean {
  return import.meta.env.MODE !== 'test';
}

export function markStartup(label: string, detail?: string): void {
  if (!isStartupTimingEnabled()) return;
  const w = startupWindow();
  if (!w) return;
  installDiagnostics(w);
  const now = performance.now();
  const entry = startupEntry(label, now, detail);
  pushStartupEntry(entry);
  addStartupDiagnostic(entry);
  performance.mark(`archora:${label.replace(/\s+/gu, '-')}`);
  if (diagnosticsEnabled()) console.info(`[startup] ${label}`, entry);
}

export function markStartupAt(
  label: string,
  elapsedFromNavigationStartMs: number,
  detail?: string,
): void {
  if (!isStartupTimingEnabled()) return;
  const w = startupWindow();
  if (!w) return;
  installDiagnostics(w);
  const now = Math.max(0, elapsedFromNavigationStartMs);
  const entry = startupEntry(label, now, detail);
  pushStartupEntry(entry);
  addStartupDiagnostic(entry);
  const markName = `archora:${label.replace(/\s+/gu, '-')}`;
  try {
    performance.mark(markName, { startTime: now });
  } catch {
    performance.mark(markName);
  }
  if (diagnosticsEnabled()) console.info(`[startup] ${label}`, entry);
}

function startupEntry(label: string, now: number, detail?: string): StartupEntry {
  const w = startupWindow();
  const entry: StartupEntry = {
    label,
    elapsedFromNavigationStartMs: Math.round(now),
    elapsedFromMainImportMs:
      w?.__frontScopeMainImportAt === undefined || now < w.__frontScopeMainImportAt
        ? null
        : Math.round(now - w.__frontScopeMainImportAt),
    elapsedFromAppMountMs:
      w?.__frontScopeAppMountAt === undefined || now < w.__frontScopeAppMountAt
        ? null
        : Math.round(now - w.__frontScopeAppMountAt),
    ...(detail ? { detail } : {}),
  };
  return entry;
}

function addStartupDiagnostic(entry: StartupEntry): void {
  addDiagnostic({
    scope: 'startup',
    name: entry.label,
    level: 'info',
    data: {
      elapsedFromNavigationStartMs: entry.elapsedFromNavigationStartMs,
      elapsedFromMainImportMs: entry.elapsedFromMainImportMs,
      elapsedFromAppMountMs: entry.elapsedFromAppMountMs,
      ...(entry.detail ? { detail: entry.detail } : {}),
    },
  });
}

export function startStartupSpan(label: string): void {
  if (!isStartupTimingEnabled()) return;
  const w = startupWindow();
  if (!w) return;
  w.__frontScopeStartupOpenSpans ??= {};
  w.__frontScopeStartupOpenSpans[label] = performance.now();
  markStartup(`${label} started`);
}

export function endStartupSpan(label: string, detail?: string): void {
  if (!isStartupTimingEnabled()) return;
  const w = startupWindow();
  if (!w) return;
  const now = performance.now();
  const start = w.__frontScopeStartupOpenSpans?.[label];
  const durationMs = start === undefined ? undefined : Math.round(now - start);
  const entry: StartupEntry = {
    label: `${label} finished`,
    elapsedFromNavigationStartMs: Math.round(now),
    elapsedFromMainImportMs:
      w.__frontScopeMainImportAt === undefined
        ? null
        : Math.round(now - w.__frontScopeMainImportAt),
    elapsedFromAppMountMs:
      w.__frontScopeAppMountAt === undefined ? null : Math.round(now - w.__frontScopeAppMountAt),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(detail ? { detail } : {}),
  };
  if (w.__frontScopeStartupOpenSpans && start !== undefined) {
    delete w.__frontScopeStartupOpenSpans[label];
  }
  pushStartupEntry(entry);
  addDiagnostic({
    scope: diagnosticScopeForSpan(label),
    name: `${label} finished`,
    level: detail === 'failed' ? 'warn' : 'info',
    data: {
      elapsedFromNavigationStartMs: entry.elapsedFromNavigationStartMs,
      elapsedFromMainImportMs: entry.elapsedFromMainImportMs,
      elapsedFromAppMountMs: entry.elapsedFromAppMountMs,
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(detail ? { detail } : {}),
    },
  });
  performance.mark(`archora:${label.replace(/\s+/gu, '-')}:finished`);
  if (diagnosticsEnabled()) console.info(`[startup] ${label} finished`, entry);
}

export function startupReport(): StartupEntry[] {
  if (!isStartupTimingEnabled()) return [];
  const w = startupWindow();
  if (!w) return [];
  const entries = w.__frontScopeStartupEntries ?? [];
  installDiagnostics(w);
  w.__frontScopeStartupReport();
  return entries;
}

export function startupEntries(): StartupEntry[] {
  if (!isStartupTimingEnabled()) return [];
  const w = startupWindow();
  return w?.__frontScopeStartupEntries ?? [];
}

function pushStartupEntry(entry: StartupEntry): void {
  const w = startupWindow();
  if (!w) return;
  w.__frontScopeStartupEntries ??= [];
  w.__frontScopeStartupEntries.push(entry);
}

function diagnosticScopeForSpan(label: string): 'startup' | 'scan' | 'tauri' | 'watcher' {
  if (label.startsWith('scan') || label.includes('analyze') || label.includes('history')) {
    return 'scan';
  }
  if (label.startsWith('tauri invoke')) return 'tauri';
  if (label.includes('watcher')) return 'watcher';
  return 'startup';
}
