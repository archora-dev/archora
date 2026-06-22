// End-to-end cache tests against the real Node FS. We use `mkdtemp` to
// give every test its own throw-away project and assert the
// load → diff → save cycle on top of an actual `analyze()`/`analyzeWithCache()` run.

import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { analyze } from '../../analyzer/index';
import { createNodeFsFileSource } from '../../analyzer/sources/nodeFsFileSource';
import {
  analyzeWithCache,
  CACHE_FORMAT_VERSION,
  computeCacheKey,
  diffAgainstManifest,
  loadCache,
  resolveCacheLocation,
  saveCache,
  statFiles,
  type CacheManifest,
} from '../index';

interface Sandbox {
  root: string;
  cleanup: () => Promise<void>;
}

async function makeSandbox(files: Record<string, string>): Promise<Sandbox> {
  const root = await mkdtemp(path.join(tmpdir(), 'archora-cache-test-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'tsconfig.json'), '{}');
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"test"}');
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

let sandbox: Sandbox;
afterEach(async () => {
  if (sandbox) await sandbox.cleanup();
});

describe('computeCacheKey', () => {
  it('is stable for identical inputs', () => {
    const a = computeCacheKey({ rootPath: '/p', toolVersion: '1.0', tsconfigText: '{}' });
    const b = computeCacheKey({ rootPath: '/p', toolVersion: '1.0', tsconfigText: '{}' });
    expect(a).toBe(b);
  });

  it('changes on tool version bump', () => {
    const a = computeCacheKey({ rootPath: '/p', toolVersion: '1.0' });
    const b = computeCacheKey({ rootPath: '/p', toolVersion: '1.1' });
    expect(a).not.toBe(b);
  });

  it('changes on tsconfig text edit', () => {
    const a = computeCacheKey({ rootPath: '/p', toolVersion: '1.0', tsconfigText: '{}' });
    const b = computeCacheKey({ rootPath: '/p', toolVersion: '1.0', tsconfigText: '{ }' });
    expect(a).not.toBe(b);
  });

  it("changes on root path change (different projects don't share cache)", () => {
    const a = computeCacheKey({ rootPath: '/p1', toolVersion: '1.0' });
    const b = computeCacheKey({ rootPath: '/p2', toolVersion: '1.0' });
    expect(a).not.toBe(b);
  });
});

describe('diffAgainstManifest', () => {
  const manifest: CacheManifest = {
    files: {
      'a.ts': { mtimeMs: 100, size: 10 },
      'b.ts': { mtimeMs: 200, size: 20 },
      'c.ts': { mtimeMs: 300, size: 30 },
    },
  };

  it('detects added/removed/changed correctly', () => {
    const current = {
      'a.ts': { mtimeMs: 100, size: 10 }, // unchanged
      'b.ts': { mtimeMs: 250, size: 20 }, // mtime changed
      // c.ts removed
      'd.ts': { mtimeMs: 400, size: 40 }, // added
    };
    const r = diffAgainstManifest(manifest, current);
    expect(r.added).toEqual(['d.ts']);
    expect(r.removed).toEqual(['c.ts']);
    expect(r.changed).toEqual(['b.ts']);
    expect(r.unchanged).toBe(1);
  });

  it('size change alone counts as changed', () => {
    const current = { 'a.ts': { mtimeMs: 100, size: 999 } };
    const r = diffAgainstManifest({ files: { 'a.ts': { mtimeMs: 100, size: 10 } } }, current);
    expect(r.changed).toEqual(['a.ts']);
  });

  it('returns all unchanged when filesystem matches manifest exactly', () => {
    const r = diffAgainstManifest(manifest, manifest.files);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.changed).toEqual([]);
    expect(r.unchanged).toBe(3);
  });
});

describe('saveCache / loadCache roundtrip', () => {
  beforeEach(async () => {
    sandbox = await makeSandbox({
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': "import { a } from './a';\nexport const b = a;\n",
    });
  });

  it('roundtrips a real ScanResult through v8.serialize', async () => {
    const source = await createNodeFsFileSource({ rootPath: sandbox.root });
    const scan = await analyze(source);
    const location = await resolveCacheLocation({ rootPath: sandbox.root, toolVersion: '1.0' });

    const files = await statFiles(
      sandbox.root,
      scan.modules.map((m) => m.id),
    );
    await saveCache(location, scan, { files }, '1.0');

    const loaded = await loadCache(location);
    expect(loaded).not.toBeNull();
    expect(loaded?.scan.modules.length).toBe(scan.modules.length);
    expect(loaded?.scan.edges).toEqual(scan.edges);
    expect(loaded?.scan.cycles).toEqual(scan.cycles);
    expect(Object.keys(loaded?.manifest.files ?? {})).toEqual(Object.keys(files));
    expect(loaded?.meta.version).toBe(CACHE_FORMAT_VERSION);
  });

  it('returns null for missing cache directory', async () => {
    const location = await resolveCacheLocation({ rootPath: sandbox.root, toolVersion: '1.0' });
    expect(await loadCache(location)).toBeNull();
  });

  it('returns null on version skew', async () => {
    const source = await createNodeFsFileSource({ rootPath: sandbox.root });
    const scan = await analyze(source);
    const location = await resolveCacheLocation({ rootPath: sandbox.root, toolVersion: '1.0' });
    const files = await statFiles(
      sandbox.root,
      scan.modules.map((m) => m.id),
    );
    await saveCache(location, scan, { files }, '1.0');

    // Tamper with meta.json to simulate an old format.
    const metaPath = path.join(location.dir, 'meta.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as { version: number };
    meta.version = -1;
    await fs.writeFile(metaPath, JSON.stringify(meta));

    expect(await loadCache(location)).toBeNull();
  });

  it('returns null on cache key mismatch (e.g. tsconfig changed)', async () => {
    const source = await createNodeFsFileSource({ rootPath: sandbox.root });
    const scan = await analyze(source);
    const locA = await resolveCacheLocation({ rootPath: sandbox.root, toolVersion: '1.0' });
    const files = await statFiles(
      sandbox.root,
      scan.modules.map((m) => m.id),
    );
    await saveCache(locA, scan, { files }, '1.0');

    // Read it back with a *different* key - emulates someone constructing a
    // location object pointing at the same dir while the meta records the
    // original key. loadCache should refuse rather than serve stale data.
    const wrong = { ...locA, cacheKey: 'wrong-key' };
    expect(await loadCache(wrong)).toBeNull();
  });

  it('returns null on corrupt manifest', async () => {
    const source = await createNodeFsFileSource({ rootPath: sandbox.root });
    const scan = await analyze(source);
    const location = await resolveCacheLocation({ rootPath: sandbox.root, toolVersion: '1.0' });
    const files = await statFiles(
      sandbox.root,
      scan.modules.map((m) => m.id),
    );
    await saveCache(location, scan, { files }, '1.0');
    await fs.writeFile(path.join(location.dir, 'manifest.bin'), 'not a v8 buffer');
    expect(await loadCache(location)).toBeNull();
  });
});

describe('analyzeWithCache', () => {
  beforeEach(async () => {
    sandbox = await makeSandbox({
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': "import { a } from './a';\nexport const b = a;\n",
      'src/c.ts': 'export const c = 3;\n',
    });
  });

  async function run(): Promise<{
    scan: import('../../analyzer/types').ScanResult;
    outcome: import('../index').CacheOutcome;
  }> {
    const source = await createNodeFsFileSource({ rootPath: sandbox.root });
    const r = await analyzeWithCache(source, {
      rootPath: sandbox.root,
      toolVersion: 'test',
    });
    return { scan: r.scan, outcome: r.outcome };
  }

  it('first run is a miss and writes the cache', async () => {
    const r = await run();
    expect(r.outcome.kind).toBe('miss');
    const location = await resolveCacheLocation({ rootPath: sandbox.root, toolVersion: 'test' });
    expect(await loadCache(location)).not.toBeNull();
  });

  it('second run with no changes is a fresh cache hit', async () => {
    await run();
    const r = await run();
    expect(r.outcome.kind).toBe('fresh');
  });

  it('modifying a file triggers an incremental rerun and matches a cold scan', async () => {
    await run();
    // Bump mtime + content of one file.
    const target = path.join(sandbox.root, 'src/b.ts');
    await fs.writeFile(target, "import { c } from './c';\nexport const b = c;\n");
    const r = await run();
    expect(r.outcome.kind).toBe('incremental');
    if (r.outcome.kind === 'incremental') {
      expect(r.outcome.changed).toBe(1);
    }

    const cold = await analyze(await createNodeFsFileSource({ rootPath: sandbox.root }));
    // Same edge set (sort to ignore order)
    const sortKey = (e: { from: string; to: string }): string => `${e.from}→${e.to}`;
    const sorted = (es: readonly { from: string; to: string }[]) =>
      [...es].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    expect(sorted(r.scan.edges)).toEqual(sorted(cold.edges));
  });

  it('removing a file is handled on the fast path', async () => {
    await run();
    await fs.unlink(path.join(sandbox.root, 'src/c.ts'));
    const r = await run();
    expect(r.outcome.kind).toBe('incremental');
    expect(r.scan.modules.find((m) => m.id === 'src/c.ts')).toBeUndefined();
  });

  it('adding a file forces a full scan (added-files invalidation)', async () => {
    await run();
    await fs.writeFile(path.join(sandbox.root, 'src/d.ts'), 'export const d = 4;\n');
    const r = await run();
    expect(r.outcome.kind).toBe('invalidated');
    if (r.outcome.kind === 'invalidated') {
      expect(r.outcome.reason).toBe('added-files');
    }
    expect(r.scan.modules.find((m) => m.id === 'src/d.ts')).toBeDefined();
  });

  it('cache key change (e.g. tsconfig edit) forces a fresh cache write', async () => {
    await run();
    await fs.writeFile(path.join(sandbox.root, 'tsconfig.json'), '{"compilerOptions":{}}');
    // Simulate the CLI passing the new tsconfig text.
    const source = await createNodeFsFileSource({ rootPath: sandbox.root });
    const r = await analyzeWithCache(source, {
      rootPath: sandbox.root,
      toolVersion: 'test',
      tsconfigText: '{"compilerOptions":{}}',
    });
    expect(r.outcome.kind).toBe('miss');
  });
});

describe('incrementalAnalyze - removed files (fast path)', () => {
  beforeEach(async () => {
    sandbox = await makeSandbox({
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
      'src/c.ts': 'export const c = 2;\n',
    });
  });

  it('drops module + incident edges and emits resolve-failed for orphaned imports', async () => {
    const source = await createNodeFsFileSource({ rootPath: sandbox.root });
    const prev = await analyze(source);
    expect(prev.modules.find((m) => m.id === 'src/b.ts')).toBeDefined();
    expect(prev.edges.find((e) => e.from === 'src/a.ts' && e.to === 'src/b.ts')).toBeDefined();

    // Remove b.ts
    await fs.unlink(path.join(sandbox.root, 'src/b.ts'));
    const source2 = await createNodeFsFileSource({ rootPath: sandbox.root });
    const { incrementalAnalyze } = await import('../../analyzer/incremental');
    const next = await incrementalAnalyze({
      prev,
      source: source2,
      changedFiles: [],
      removedFiles: ['src/b.ts'],
    });

    expect(next.modules.find((m) => m.id === 'src/b.ts')).toBeUndefined();
    expect(next.edges.find((e) => e.to === 'src/b.ts')).toBeUndefined();
    expect(
      next.warnings.find((w) => w.code === 'resolve-failed' && w.file === 'src/a.ts'),
    ).toBeDefined();
  });
});
