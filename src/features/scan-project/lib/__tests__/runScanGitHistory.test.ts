import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { GitHistory } from '@/core/git/types';
import type { ScanResult } from '@/core/analyzer/types';
import type { FileSource } from '@/core/analyzer/fileSource';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const loadGitHistoryMock = vi.fn<(root: string) => Promise<GitHistory | null>>();
vi.mock('../loadGitHistory', () => ({
  loadGitHistory: (root: string) => loadGitHistoryMock(root),
}));

const runInlineAnalyzeMock = vi.fn<(source: FileSource, opts?: object) => Promise<ScanResult>>();
vi.mock('../runInlineAnalyze', () => ({
  runInlineAnalyze: (source: FileSource, opts?: object) => runInlineAnalyzeMock(source, opts),
  runIncrementalAnalyze: vi.fn(async () => makeResult()),
}));

vi.mock('../runScanInWorker', async () => {
  const actual = await vi.importActual<typeof import('../runScanInWorker')>('../runScanInWorker');
  return { ...actual, runScanInWorker: vi.fn() };
});

// Stub store interactions — we only care about analyze options, not the full
// scan lifecycle in these tests.
vi.mock('@/entities/project', () => ({
  useProjectStore: () => ({ setCurrent: vi.fn(), recent: [] }),
}));
vi.mock('@/entities/scan', () => ({
  useScanStore: () => ({
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    setProgress: vi.fn(),
    setConfig: vi.fn(),
    startedAt: 0,
    status: 'idle',
  }),
}));
vi.mock('@/entities/history', () => ({
  useHistoryStore: () => ({ add: vi.fn(), init: vi.fn() }),
}));
vi.mock('@/shared/lib', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib')>('@/shared/lib');
  return {
    ...actual,
    saveProjectLocator: vi.fn().mockResolvedValue(undefined),
    loadProjectLocator: vi.fn().mockResolvedValue(null),
  };
});
vi.mock('@/core/config/frontScopeConfig', () => ({
  loadArchoraConfig: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(root = '/proj', fileCount = 5): FileSource {
  return {
    rootPath: root,
    list: vi.fn(async () => Array.from({ length: fileCount }, (_, i) => `src/f${i}.ts`)),
    read: vi.fn(async () => 'export {}'),
    exists: vi.fn(async () => false),
  };
}

function makeResult(): ScanResult {
  return {
    project: { id: 'p1', name: 'proj', rootPath: '/proj', detectedFramework: 'generic' },
    modules: [],
    cycles: [],
    layerViolations: [],
    contractViolations: [],
    warnings: [],
    hotspots: [],
    churn: {},
    temporalCoupling: [],
    configDiagnostics: [],
    graph: { nodes: [], edges: [] },
  } as unknown as ScanResult;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runScanFlow git history wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    loadGitHistoryMock.mockReset();
    runInlineAnalyzeMock.mockReset();
    runInlineAnalyzeMock.mockResolvedValue(makeResult());
  });

  it('passes gitHistory into analyze options when loadGitHistory returns history', async () => {
    const { runScanFlow } = await import('../runScan');
    const gitHistory: GitHistory = {
      since: '2026-01-01T00:00:00+00:00',
      until: '2026-06-01T00:00:00+00:00',
      commits: [],
      includesMerges: false,
    };
    loadGitHistoryMock.mockResolvedValue(gitHistory);

    const source = makeSource('/repo');
    const locator = { kind: 'tauri' as const, path: '/repo', name: 'repo' };
    await runScanFlow({ source, locator, runner: 'inline' });

    const calls = runInlineAnalyzeMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0]![1] as { gitHistory?: GitHistory };
    expect(opts?.gitHistory).toBe(gitHistory);
  });

  it('omits gitHistory from analyze options when loadGitHistory returns null', async () => {
    const { runScanFlow } = await import('../runScan');
    loadGitHistoryMock.mockResolvedValue(null);

    const source = makeSource('/repo');
    const locator = { kind: 'tauri' as const, path: '/repo', name: 'repo' };
    await runScanFlow({ source, locator, runner: 'inline' });

    const calls = runInlineAnalyzeMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0]![1] as Record<string, unknown>;
    expect(opts?.gitHistory).toBeUndefined();
  });

  it('does not call loadGitHistory on the incremental path', async () => {
    const { runScanFlow } = await import('../runScan');
    const source = makeSource('/repo');
    const prev = makeResult();
    await runScanFlow({
      source,
      runner: 'inline',
      incrementalFrom: { prev, changedFiles: ['src/f0.ts'] },
    });

    expect(loadGitHistoryMock).not.toHaveBeenCalled();
  });

  it('proceeds with no gitHistory when loadGitHistory throws', async () => {
    const { runScanFlow } = await import('../runScan');
    loadGitHistoryMock.mockRejectedValue(new Error('unexpected'));

    const source = makeSource('/repo');
    const locator = { kind: 'tauri' as const, path: '/repo', name: 'repo' };
    // Should not throw
    const result = await runScanFlow({ source, locator, runner: 'inline' });
    expect(result).toBeDefined();

    const opts = runInlineAnalyzeMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts?.gitHistory).toBeUndefined();
  });

  it('skips loadGitHistory when locator is fsAccess (no absolute root in Tauri)', async () => {
    const { runScanFlow } = await import('../runScan');
    const source = makeSource('/proj');
    const locator = {
      kind: 'fsAccess' as const,
      handle: {} as FileSystemDirectoryHandle,
    };
    await runScanFlow({ source, locator, runner: 'inline' });

    expect(loadGitHistoryMock).not.toHaveBeenCalled();
  });
});
