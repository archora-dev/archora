export type DiagnosticScope =
  | 'startup'
  | 'router'
  | 'scan'
  | 'parser'
  | 'analyzer'
  | 'ui'
  | 'idle'
  | 'tauri'
  | 'watcher'
  | 'perf'
  | 'error';

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticEventInput {
  scope: DiagnosticScope;
  name: string;
  level: DiagnosticLevel;
  data?: Record<string, unknown>;
}

export interface DiagnosticEvent extends DiagnosticEventInput {
  ts: number;
  elapsedMs: number;
  count?: number;
}

export interface DiagnosticsSnapshot {
  version: 1;
  createdAt: string;
  app: {
    mode: string;
    url: string;
    userAgent: string;
    platform: string;
    tauri: boolean;
  };
  startupSummary: Record<string, unknown>;
  scanSummary: Record<string, unknown>;
  errorSummary: Record<string, unknown>;
  events: DiagnosticEvent[];
}

export type DiagnosticsSaveMethod = 'tauri' | 'browser';

export interface DiagnosticsSaveResult {
  ok: boolean;
  method: DiagnosticsSaveMethod;
  path?: string;
  error?: string;
}

export interface StartupReport {
  startup: DiagnosticEvent[];
  scan: Record<string, unknown>;
  active: {
    backendInvokeInFlight: number;
    activeWatcherCount: number;
  };
}

export interface DiagnosticsCollector {
  enable(): void;
  disable(): void;
  clear(): void;
  add(event: DiagnosticEventInput): void;
  snapshot(): DiagnosticsSnapshot;
  asText(): string;
  download(): Promise<DiagnosticsSaveResult>;
  saveToFile(): Promise<DiagnosticsSaveResult>;
  copy(): Promise<void>;
  isEnabled(): boolean;
}

interface DiagnosticsOptions {
  now?: () => number;
  maxEvents?: number;
  initialEnabled?: boolean;
}

declare global {
  interface Window {
    __frontScopeDiagnostics: DiagnosticsCollector;
    __frontScopeStartupReport: () => StartupReport;
  }
}

const DEFAULT_MAX_EVENTS = 2_000;
const MAX_STRING_LENGTH = 500;
const EVENT_RATE_WINDOW_MS = 1_000;
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|env/iu;
const PATH_VALUE_KEY = /path|root|file|dir/iu;

export function createDiagnosticsCollector(options: DiagnosticsOptions = {}): DiagnosticsCollector {
  const now = options.now ?? (() => performance.now());
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const startedAt = now();
  let enabled = options.initialEnabled ?? diagnosticsFlagEnabled();
  let events: DiagnosticEvent[] = [];

  const collector: DiagnosticsCollector = {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
    },
    clear() {
      events = [];
    },
    add(input) {
      const event: DiagnosticEvent = {
        ...input,
        ts: Date.now(),
        elapsedMs: Math.round(now() - startedAt),
        ...(input.data ? { data: sanitizeRecord(input.data) } : {}),
      };
      const last = events[events.length - 1];
      if (last && sameDiagnostic(last, event)) {
        last.count = (last.count ?? 1) + 1;
        last.ts = event.ts;
        last.elapsedMs = event.elapsedMs;
        return;
      }
      events.push(event);
      if (events.length > maxEvents) events = events.slice(events.length - maxEvents);
    },
    snapshot() {
      return buildSnapshot(events);
    },
    asText() {
      return JSON.stringify(collector.snapshot(), null, 2);
    },
    async download() {
      return collector.saveToFile();
    },
    async saveToFile() {
      const filename = `archora-diagnostics-${formatTimestamp(new Date())}.json`;
      const text = collector.asText();
      if (isTauriRuntime()) {
        try {
          const { save } = await import('@tauri-apps/plugin-dialog');
          const { invoke } = await import('@tauri-apps/api/core');
          const path = await save({
            defaultPath: filename,
            filters: [{ name: 'JSON', extensions: ['json'] }],
          });
          if (!path) return { ok: false, method: 'tauri', error: 'cancelled' };
          await invoke('write_text_file', { path, content: text });
          return { ok: true, method: 'tauri', path };
        } catch (err) {
          return {
            ok: false,
            method: 'tauri',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return { ok: true, method: 'browser' };
    },
    async copy() {
      await navigator.clipboard.writeText(collector.asText());
    },
    isEnabled() {
      return enabled;
    },
  };

  return collector;
}

export function installDiagnostics(
  target: Window = window,
  options: DiagnosticsOptions = {},
): DiagnosticsCollector {
  const existing = target.__frontScopeDiagnostics;
  const diagnostics = existing ?? createDiagnosticsCollector(options);
  target.__frontScopeDiagnostics = diagnostics;
  target.__frontScopeStartupReport = () => {
    const report = buildStartupReport(diagnostics.snapshot());
    printStartupReport(report);
    return report;
  };
  if (diagnostics.isEnabled()) installDiagnosticsButton(target, diagnostics);
  return diagnostics;
}

export function diagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.__frontScopeDiagnostics?.isEnabled() ?? diagnosticsFlagEnabled();
}

export function addDiagnostic(event: DiagnosticEventInput): void {
  if (typeof window === 'undefined') return;
  window.__frontScopeDiagnostics?.add(event);
}

export function buildStartupReport(snapshot: DiagnosticsSnapshot): StartupReport {
  return {
    startup: snapshot.events.filter((event) => event.scope === 'startup'),
    scan: snapshot.scanSummary,
    active: {
      backendInvokeInFlight: Number(snapshot.scanSummary.backendInvokeInFlight ?? 0),
      activeWatcherCount: Number(snapshot.scanSummary.activeWatcherCount ?? 0),
    },
  };
}

export function formatStartupReport(report: StartupReport): string {
  return [
    'Archora diagnostics summary',
    `Startup events: ${report.startup.length}`,
    `Active backend invokes: ${report.active.backendInvokeInFlight}`,
    `Active watchers: ${report.active.activeWatcherCount}`,
    `Errors captured: ${report.scan.errorCount ?? 0}`,
    'Run window.__frontScopeDiagnostics.download() to save full diagnostics.',
  ].join('\n');
}

function printStartupReport(report: StartupReport): void {
  console.info(formatStartupReport(report));
  if (report.startup.length > 0) console.table(report.startup);
  console.table([report.scan]);
}

function buildSnapshot(events: DiagnosticEvent[]): DiagnosticsSnapshot {
  const copied = events.map((event) => ({ ...event }));
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    app: {
      mode: import.meta.env.MODE,
      url: typeof location === 'undefined' ? '' : sanitizePath(location.href),
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      platform: typeof navigator === 'undefined' ? '' : navigator.platform,
      tauri:
        typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window),
    },
    startupSummary: { ...navigationTimingSummary(), ...summarizeStartup(copied) },
    scanSummary: { ...summarizeScan(copied), ...summarizeErrors(copied) },
    errorSummary: summarizeErrors(copied),
    events: copied,
  };
}

function summarizeStartup(events: DiagnosticEvent[]): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const event of events) {
    if (event.scope !== 'startup') continue;
    const key = startupSummaryKey(event.name);
    if (key) summary[key] = event.elapsedMs;
  }
  return summary;
}

function summarizeScan(events: DiagnosticEvent[]): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    activeScanCount: 0,
    activeWatcherCount: 0,
    backendInvokeInFlight: 0,
    parserWarningCount: 0,
    analyzerWarningCount: 0,
    analyzerPhase: 'idle',
    uiInputLatencyMs: 0,
    uiScrollCostMs: 0,
    uiRenderedItems: 0,
    idleFrameDelayMs: 0,
    idleLongTaskCount: 0,
    watcherEventCountPerSecond: 0,
    watcherRescanCount: 0,
  };
  const latestWatcher = [...events].reverse().find((event) => event.scope === 'watcher');
  const latestElapsedMs = latestWatcher?.elapsedMs ?? 0;
  for (const event of events) {
    if (
      event.scope !== 'scan' &&
      event.scope !== 'parser' &&
      event.scope !== 'analyzer' &&
      event.scope !== 'ui' &&
      event.scope !== 'idle' &&
      event.scope !== 'tauri' &&
      event.scope !== 'watcher'
    ) {
      continue;
    }
    Object.assign(summary, event.data ?? {});
    if (event.scope === 'watcher' && event.name.includes('rescan')) {
      summary.watcherRescanCount = Number(summary.watcherRescanCount ?? 0) + (event.count ?? 1);
    }
  }
  if (latestWatcher) {
    summary.lastWatcherEventAt = latestWatcher.ts;
    summary.watcherEventCountPerSecond = events
      .filter(
        (event) =>
          event.scope === 'watcher' && latestElapsedMs - event.elapsedMs <= EVENT_RATE_WINDOW_MS,
      )
      .reduce((count, event) => count + (event.count ?? 1), 0);
  }
  return summary;
}

function summarizeErrors(events: DiagnosticEvent[]): Record<string, unknown> {
  const errors = events.filter((event) => event.scope === 'error');
  const errorCount = errors.reduce((count, event) => count + (event.count ?? 1), 0);
  const latest = errors[errors.length - 1];
  if (!latest) return { errorCount: 0 };
  return {
    errorCount,
    latestErrorAt: latest.ts,
    latestErrorSource: latest.name,
    latestErrorMessage:
      typeof latest.data?.['message'] === 'string' ? latest.data['message'] : latest.name,
  };
}

function startupSummaryKey(name: string): string | null {
  const normalized = name.toLowerCase();
  if (normalized.includes('page load started')) return 'navigationStartToPageLoadStartedMs';
  if (normalized.includes('page load finished')) return 'navigationStartToPageLoadFinishedMs';
  if (normalized.includes('app start')) return 'navigationStartToAppStartMs';
  if (normalized.includes('main.ts imported')) return 'navigationStartToMainImportMs';
  if (normalized.includes('vue mount start')) return 'navigationStartToVueMountStartMs';
  if (normalized.includes('vue app mounted')) return 'navigationStartToVueMountedMs';
  if (normalized.includes('route ready')) return 'navigationStartToRouteReadyMs';
  if (normalized.includes('scan start')) return 'navigationStartToScanStartMs';
  if (normalized.includes('first progress visible'))
    return 'navigationStartToFirstProgressVisibleMs';
  if (normalized.includes('scan complete')) return 'navigationStartToScanCompleteMs';
  if (normalized.includes('workspace rendered')) return 'navigationStartToWorkspaceRenderedMs';
  if (normalized.includes('main screen visible')) return 'navigationStartToMainScreenVisibleMs';
  return null;
}

function navigationTimingSummary(): Record<string, unknown> {
  if (typeof performance === 'undefined') return {};
  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!navigation) return {};

  return {
    navigationStartToPageLoadStartedMs: Math.round(navigation.startTime),
    ...(navigation.loadEventEnd > 0
      ? { navigationStartToPageLoadFinishedMs: Math.round(navigation.loadEventEnd) }
      : {}),
    ...(navigation.domInteractive > 0
      ? { navigationStartToDomInteractiveMs: Math.round(navigation.domInteractive) }
      : {}),
  };
}

function sameDiagnostic(a: DiagnosticEvent, b: DiagnosticEvent): boolean {
  return (
    a.scope === b.scope &&
    a.name === b.name &&
    a.level === b.level &&
    stableJson(a.data) === stableJson(b.data)
  );
}

function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEY.test(key)) continue;
    sanitized[key] = sanitizeValue(value, key, 0);
  }
  return sanitized;
}

function sanitizeValue(value: unknown, key: string, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const masked = PATH_VALUE_KEY.test(key) || looksLikePath(value) ? sanitizePath(value) : value;
    return masked.length > MAX_STRING_LENGTH ? `${masked.slice(0, MAX_STRING_LENGTH)}...` : masked;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    if (value.every((item) => typeof item !== 'object' || item === null) && value.length <= 20) {
      return value.map((item) => sanitizeValue(item, key, depth + 1));
    }
    return `[array:${value.length}]`;
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '[object]';
    return sanitizeRecord(value as Record<string, unknown>);
  }
  return String(value);
}

function sanitizePath(value: string): string {
  return value
    .replace(/file:\/\/[^?#\s]+/giu, 'file://<path>')
    .replace(/\/(?:Users|home)\/[^/?#\s]+\/[^?#\s]*/giu, '<path>')
    .replace(/[A-Z]:\\[^?#\s]+/giu, '<path>');
}

function looksLikePath(value: string): boolean {
  return /^([A-Z]:\\|\/(?:Users|home|tmp|var)\/|file:\/\/)/iu.test(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys((value ?? {}) as Record<string, unknown>).sort());
}

function diagnosticsFlagEnabled(): boolean {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return (
    params.get('diagnostics') === '1' ||
    params.get('debugStartup') === '1' ||
    params.get('debugPerf') === '1' ||
    localStorageFlagEnabled('archora.debugPerf')
  );
}

function localStorageFlagEnabled(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

function installDiagnosticsButton(target: Window, diagnostics: DiagnosticsCollector): void {
  if (target.document.getElementById('archora-diagnostics-download')) return;
  const button = target.document.createElement('button');
  button.id = 'archora-diagnostics-download';
  button.type = 'button';
  button.textContent = 'Download diagnostics';
  button.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#e2e8f0;font:12px sans-serif;';
  button.addEventListener('click', () => diagnostics.download());
  target.document.body.appendChild(button);
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}
