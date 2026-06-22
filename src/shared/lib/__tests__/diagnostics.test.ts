import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDiagnosticsCollector,
  formatStartupReport,
  installDiagnostics,
} from '../diagnostics';

describe('diagnostics collector', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:archora-diagnostics'),
      revokeObjectURL: vi.fn(),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('records events and dedupes repeated errors', () => {
    const diagnostics = createDiagnosticsCollector({ now: () => 1200, maxEvents: 20 });

    diagnostics.add({ scope: 'startup', name: 'main.ts imported', level: 'info' });
    diagnostics.add({
      scope: 'error',
      name: 'window.error',
      level: 'error',
      data: { message: 'boom' },
    });
    diagnostics.add({
      scope: 'error',
      name: 'window.error',
      level: 'error',
      data: { message: 'boom' },
    });

    const snapshot = diagnostics.snapshot();

    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.events[1]).toMatchObject({
      scope: 'error',
      name: 'window.error',
      count: 2,
    });
    expect(snapshot.errorSummary).toMatchObject({
      errorCount: 2,
      latestErrorSource: 'window.error',
      latestErrorMessage: 'boom',
    });
  });

  it('summarizes startup milestones used by the desktop perf pass', () => {
    const diagnostics = createDiagnosticsCollector({ now: () => 1200, maxEvents: 20 });

    diagnostics.add({ scope: 'startup', name: 'page load started', level: 'info' });
    diagnostics.add({ scope: 'startup', name: 'app start', level: 'info' });
    diagnostics.add({ scope: 'startup', name: 'scan start', level: 'info' });
    diagnostics.add({ scope: 'startup', name: 'scan complete', level: 'info' });
    diagnostics.add({ scope: 'startup', name: 'page load finished', level: 'info' });

    expect(diagnostics.snapshot().startupSummary).toMatchObject({
      navigationStartToPageLoadStartedMs: 0,
      navigationStartToAppStartMs: 0,
      navigationStartToScanStartMs: 0,
      navigationStartToScanCompleteMs: 0,
      navigationStartToPageLoadFinishedMs: 0,
    });
  });

  it('keeps diagnostics payload small and private', () => {
    const diagnostics = createDiagnosticsCollector({ now: () => 10 });
    diagnostics.add({
      scope: 'scan',
      name: 'scan finished',
      level: 'info',
      data: {
        rootPath: '/Users/alex/work/private-app',
        token: 'secret',
        source: 'x'.repeat(20_000),
        modules: [{ id: '/Users/alex/work/private-app/src/a.ts' }],
      },
    });

    const payload = JSON.stringify(diagnostics.snapshot());

    expect(payload).not.toContain('/Users/alex/work/private-app');
    expect(payload).not.toContain('secret');
    expect(payload).not.toContain('x'.repeat(1000));
    expect(payload).toContain('<path>');
    expect(payload).toContain('[array:1]');
  });

  it('downloads and copies a JSON snapshot', async () => {
    const click = vi.fn();
    const diagnostics = createDiagnosticsCollector({ now: () => 10 });
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
      if (tagName === 'a') Object.assign(element, { click });
      return element as HTMLElement;
    }) as typeof document.createElement);

    diagnostics.add({ scope: 'startup', name: 'Vue app mounted', level: 'info' });
    await expect(diagnostics.download()).resolves.toMatchObject({ ok: true, method: 'browser' });
    await diagnostics.copy();

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('"events"'));
  });

  it('installs window API and formats startup report without console side effects', () => {
    const diagnostics = installDiagnostics(window, { now: () => 100 });
    diagnostics.add({ scope: 'startup', name: 'main.ts imported', level: 'info' });

    const report = window.__frontScopeStartupReport();

    expect(window.__frontScopeDiagnostics.snapshot().events).toHaveLength(1);
    expect(report.startup).toHaveLength(1);
    expect(formatStartupReport(report)).toContain('window.__frontScopeDiagnostics.download()');
    expect(formatStartupReport(report)).toContain('Errors captured: 0');
  });

  it('summarizes watcher activity', () => {
    const diagnostics = createDiagnosticsCollector({ now: () => 2_000 });

    diagnostics.add({
      scope: 'watcher',
      name: 'watcher started',
      level: 'info',
      data: { activeWatcherCount: 1 },
    });
    diagnostics.add({ scope: 'watcher', name: 'watcher changed', level: 'debug' });
    diagnostics.add({ scope: 'watcher', name: 'watcher rescan finished', level: 'info' });

    expect(diagnostics.snapshot().scanSummary).toMatchObject({
      activeWatcherCount: 1,
      watcherEventCountPerSecond: 3,
      watcherRescanCount: 1,
    });
    expect(diagnostics.snapshot().scanSummary.lastWatcherEventAt).toEqual(expect.any(Number));
  });

  it('summarizes parser, analyzer, UI and idle counters', () => {
    const diagnostics = createDiagnosticsCollector({ now: () => 2_000 });

    diagnostics.add({
      scope: 'parser',
      name: 'parser progress',
      level: 'debug',
      data: { parserPhase: 'parse', parserCurrent: 4, parserTotal: 10 },
    });
    diagnostics.add({
      scope: 'analyzer',
      name: 'analyzer progress',
      level: 'debug',
      data: { analyzerPhase: 'metrics', analyzerCurrent: 8, analyzerTotal: 10 },
    });
    diagnostics.add({
      scope: 'scan',
      name: 'scan finished',
      level: 'info',
      data: { parserWarningCount: 1, analyzerWarningCount: 2 },
    });
    diagnostics.add({
      scope: 'ui',
      name: 'input latency',
      level: 'debug',
      data: { uiInputLatencyMs: 12, uiRenderedItems: 42 },
    });
    diagnostics.add({
      scope: 'idle',
      name: 'idle frame sample',
      level: 'debug',
      data: { idleFrameDelayMs: 3, idleLongTaskCount: 1 },
    });

    expect(diagnostics.snapshot().scanSummary).toMatchObject({
      parserPhase: 'parse',
      parserCurrent: 4,
      parserTotal: 10,
      analyzerPhase: 'metrics',
      analyzerCurrent: 8,
      analyzerTotal: 10,
      parserWarningCount: 1,
      analyzerWarningCount: 2,
      uiInputLatencyMs: 12,
      uiRenderedItems: 42,
      idleFrameDelayMs: 3,
      idleLongTaskCount: 1,
    });
  });
});
