import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ScanResult } from '@/core/analyzer/types';
import type { FileSource } from '@/core/analyzer/fileSource';
import { useSettingsStore } from '@/entities/settings';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../loadGitHistory', () => ({
  loadGitHistory: vi.fn(async () => null),
}));

const runInlineAnalyzeMock = vi.fn<(source: FileSource, opts?: object) => Promise<ScanResult>>();
const runScanInWorkerMock = vi.fn<(source: FileSource, opts?: object) => Promise<ScanResult>>();

vi.mock('../runInlineAnalyze', () => ({
  runInlineAnalyze: (source: FileSource, opts?: object) => runInlineAnalyzeMock(source, opts),
  runIncrementalAnalyze: vi.fn(async () => makeResult()),
}));

vi.mock('../runScanInWorker', async () => {
  const actual = await vi.importActual<typeof import('../runScanInWorker')>('../runScanInWorker');
  return {
    ...actual,
    runScanInWorker: (source: FileSource, opts?: object) => runScanInWorkerMock(source, opts),
  };
});

// Stub the heavier stores — only analyze options matter here.
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
    appliedIgnoreGlobs: null,
  }),
}));
vi.mock('@/entities/history', () => ({
  useHistoryStore: () => ({ add: vi.fn(), init: vi.fn() }),
}));
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

describe('runScanFlow excluded-path wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    runInlineAnalyzeMock.mockReset();
    runInlineAnalyzeMock.mockResolvedValue(makeResult());
    runScanInWorkerMock.mockReset();
    runScanInWorkerMock.mockResolvedValue(makeResult());
  });

  it('passes the user excluded paths into inline analyze as discover.extraIgnoreGlobs', async () => {
    const settings = useSettingsStore();
    settings.setAnalysis('generatedPaths', ['packages/cli/**', '**/generated/**']);

    const { runScanFlow } = await import('../runScan');
    await runScanFlow({ source: makeSource(), runner: 'inline' });

    const opts = runInlineAnalyzeMock.mock.calls[0]![1] as {
      discover?: { extraIgnoreGlobs?: string[] };
    };
    expect(opts.discover?.extraIgnoreGlobs).toEqual(['packages/cli/**', '**/generated/**']);
  });

  it('forwards excluded paths through the worker path as plain discover options', async () => {
    // `shouldUseWorker` short-circuits to inline when `Worker` is absent
    // (happy-dom). Stub it so the worker branch is exercised; the worker
    // already postMessages `analyzeOptions` (incl. `discover`) as plain JSON.
    const hadWorker = 'Worker' in globalThis;
    if (!hadWorker) (globalThis as { Worker?: unknown }).Worker = class {};
    try {
      const settings = useSettingsStore();
      settings.setAnalysis('generatedPaths', ['packages/cli/**']);

      const { runScanFlow } = await import('../runScan');
      await runScanFlow({ source: makeSource(), runner: 'worker' });

      const opts = runScanInWorkerMock.mock.calls[0]![1] as {
        discover?: { extraIgnoreGlobs?: string[] };
      };
      expect(opts.discover?.extraIgnoreGlobs).toEqual(['packages/cli/**']);
    } finally {
      if (!hadWorker) delete (globalThis as { Worker?: unknown }).Worker;
    }
  });

  it('omits discover options when no excluded paths are configured', async () => {
    const { runScanFlow } = await import('../runScan');
    await runScanFlow({ source: makeSource(), runner: 'inline' });

    const opts = runInlineAnalyzeMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts.discover).toBeUndefined();
  });
});
