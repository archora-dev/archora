// Persistent analyzer cache (Node-only).
//
// Layout: `<cacheRoot>/<cacheKey>/{manifest.bin, scan.bin, meta.json}`
//   - cacheRoot: `node_modules/.cache/archora/` when present in the
//     project, otherwise `<os-tmp>/archora-cache/<project-hash>/`.
//   - cacheKey: sha1 hash of (archora version + tsconfig + package deps +
//     archora config + absolute rootPath). A change in any of these
//     invalidates the whole cache for the project.
//   - manifest.bin: `v8.serialize`d `{ files: Record<relPath, { mtimeMs, size }> }`
//   - scan.bin: `v8.serialize`d `ScanResult`
//   - meta.json: plain-text `{ version, createdAt, cacheKey, rootPath }` —
//     readable for debugging and `archora cache clear` bookkeeping.
//
// Invalidation uses file `(mtimeMs, size)` tuples as the identity token,
// matching what esbuild/vite/turbo do: touching a file without changing it
// triggers a re-parse, which is acceptable for a dev tool and dramatically
// faster than content hashing. A version mismatch in meta.json forces a full
// rescan (bump `CACHE_FORMAT_VERSION` on any serialized shape change).

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deserialize, serialize } from 'node:v8';

import type { FileSource } from '../analyzer/fileSource';
import type { ScanResult } from '../analyzer/types';
import { analyze, type AnalyzeOptions } from '../analyzer/index';
import { incrementalAnalyze } from '../analyzer/incremental';
import { discoverFiles } from '../analyzer/discover';

/**
 * Bump whenever the on-disk shape of `ScanResult`/manifest changes, OR whenever
 * the analyzer's OUTPUT semantics change (new/changed findings, ranking, or
 * filtering) — otherwise a warm cache keyed only on source+tool version serves
 * stale results that don't reflect the improved analysis. A mismatch causes
 * `loadCache` to treat the entry as missing.
 *
 * v3: barrel modules excluded from hot zones; temporal-coupling findings limited
 *     to hidden cross-boundary pairs.
 * v4: tsconfig path wildcards with an interior star (key @x/* mapping to target
 *     pkgs/[star]/src) now resolve, so cross-package edges that were previously
 *     dropped appear in the graph.
 * v5: timer-cleanup memory risk no longer flags bare fire-and-forget setTimeout
 *     calls; only captured (stored/returned/passed) timer handles without
 *     clearTimeout are reported, reducing false positives.
 * v7: modules carry `isServerActions`; `rsc-leak` no longer flags client
 *     imports of `'use server'` Server Actions modules (the intended Next.js
 *     pattern), only client->server-only imports.
 */
export const CACHE_FORMAT_VERSION = 7;

/**
 * Marker used inside `node_modules/.cache/archora/`. Also the directory
 * name placed under the OS temp fallback root.
 */
const CACHE_DIR_NAME = 'archora';

export interface FileStat {
  /** Posix-style relative path from project root. */
  mtimeMs: number;
  size: number;
}

export interface CacheManifest {
  /** `relPath → {mtimeMs, size}` for every file that participated in the scan. */
  files: Record<string, FileStat>;
}

export interface CacheMeta {
  version: number;
  /** ISO timestamp of the write. */
  createdAt: string;
  cacheKey: string;
  /** Absolute project root the cache was produced for. */
  rootPath: string;
  /** Canonical archora version the cache was produced with (for diagnostics). */
  toolVersion: string;
}

export interface CacheEntry {
  scan: ScanResult;
  manifest: CacheManifest;
  meta: CacheMeta;
}

export interface CacheKeyInputs {
  rootPath: string;
  /** `@archora/core` package version (or equivalent marker). */
  toolVersion: string;
  /** Raw text of project `tsconfig.json`/`tsconfig.base.json`, if any. */
  tsconfigText?: string;
  /** Stringified `dependencies` + `devDependencies` from `package.json`. */
  packageDeps?: string;
  /** Raw text of `.archora.json` / `archora.config.json`, if any. */
  frontScopeConfigText?: string;
}

export interface CacheLocation {
  /** Absolute path to the per-project cache directory (`<root>/<cacheKey>/`). */
  dir: string;
  /** Absolute path to the cache root (parent of `dir`), used by `clearAll`. */
  root: string;
  cacheKey: string;
}

/**
 * Determine where to place the cache for a given project. Prefers
 * `<projectRoot>/node_modules/.cache/archora/<key>` (the industry
 * convention for Node tool caches - auto-ignored by git because the whole
 * `node_modules` tree is). Falls back to `<os-tmp>/archora-cache/<project-hash>/<key>`
 * when no `node_modules` directory exists (bare scripts, Vue/React in a
 * monorepo with package manager other than npm, external project analysis).
 */
export async function resolveCacheLocation(inputs: CacheKeyInputs): Promise<CacheLocation> {
  const cacheKey = computeCacheKey(inputs);
  const root = await resolveCacheRoot(inputs.rootPath);
  return { dir: path.join(root, cacheKey), root, cacheKey };
}

async function resolveCacheRoot(rootPath: string): Promise<string> {
  const preferred = path.join(rootPath, 'node_modules', '.cache', CACHE_DIR_NAME);
  try {
    const nm = await fs.stat(path.join(rootPath, 'node_modules'));
    if (nm.isDirectory()) return preferred;
  } catch {
    /* no node_modules - fall through */
  }
  const projectHash = sha1(path.resolve(rootPath)).slice(0, 16);
  return path.join(tmpdir(), `${CACHE_DIR_NAME}-cache`, projectHash);
}

/**
 * Stable hash of all inputs that should force full re-analysis on change.
 * Order-sensitive but the fields themselves are taken verbatim, so
 * whitespace-only edits to tsconfig still bust the cache - matching TS/Vite
 * behaviour where config whitespace can affect things like JSON trailing
 * commas that TS treats as errors.
 */
export function computeCacheKey(inputs: CacheKeyInputs): string {
  const parts = [
    `v${CACHE_FORMAT_VERSION}`,
    `tool:${inputs.toolVersion}`,
    `root:${path.resolve(inputs.rootPath)}`,
    `tsconfig:${inputs.tsconfigText ?? ''}`,
    `deps:${inputs.packageDeps ?? ''}`,
    `fsconfig:${inputs.frontScopeConfigText ?? ''}`,
  ];
  return sha1(parts.join('\u0000')).slice(0, 24);
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

/**
 * Stat a list of files under `rootPath` in parallel. Missing files are
 * silently dropped from the result - the caller compares this against the
 * manifest to derive added/removed sets.
 */
export async function statFiles(
  rootPath: string,
  relPaths: readonly string[],
): Promise<Record<string, FileStat>> {
  const out: Record<string, FileStat> = {};
  // Batch to avoid FD exhaustion on huge projects. 128 is comfortable
  // everywhere (macOS default `ulimit -n 256`, Linux 1024+, Windows 8192).
  const BATCH = 128;
  for (let i = 0; i < relPaths.length; i += BATCH) {
    const batch = relPaths.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (rel) => {
        try {
          const st = await fs.stat(path.join(rootPath, rel));
          if (st.isFile()) out[rel] = { mtimeMs: st.mtimeMs, size: st.size };
        } catch {
          /* missing - drop */
        }
      }),
    );
  }
  return out;
}

export interface DiffResult {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

/**
 * Compare the freshly-stat'd filesystem state against a cached manifest.
 * Returns three disjoint sets the incremental analyzer can consume.
 */
export function diffAgainstManifest(
  manifest: CacheManifest,
  current: Record<string, FileStat>,
): DiffResult {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  let unchanged = 0;
  for (const [rel, st] of Object.entries(current)) {
    const prev = manifest.files[rel];
    if (!prev) {
      added.push(rel);
    } else if (prev.mtimeMs !== st.mtimeMs || prev.size !== st.size) {
      changed.push(rel);
    } else {
      unchanged++;
    }
  }
  for (const rel of Object.keys(manifest.files)) {
    if (!(rel in current)) removed.push(rel);
  }
  return { added, removed, changed, unchanged };
}

export async function loadCache(location: CacheLocation): Promise<CacheEntry | null> {
  try {
    const [metaRaw, manifestBuf, scanBuf] = await Promise.all([
      fs.readFile(path.join(location.dir, 'meta.json'), 'utf8'),
      fs.readFile(path.join(location.dir, 'manifest.bin')),
      fs.readFile(path.join(location.dir, 'scan.bin')),
    ]);
    const meta = JSON.parse(metaRaw) as CacheMeta;
    if (meta.version !== CACHE_FORMAT_VERSION) return null;
    if (meta.cacheKey !== location.cacheKey) return null;
    const manifest = deserialize(manifestBuf) as CacheManifest;
    const scan = deserialize(scanBuf) as ScanResult;
    if (!manifest?.files || !scan?.modules) return null;
    return { scan, manifest, meta };
  } catch {
    return null;
  }
}

export async function saveCache(
  location: CacheLocation,
  scan: ScanResult,
  manifest: CacheManifest,
  toolVersion: string,
): Promise<void> {
  await fs.mkdir(location.dir, { recursive: true });
  const meta: CacheMeta = {
    version: CACHE_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    cacheKey: location.cacheKey,
    rootPath: path.resolve(scan.project.rootPath),
    toolVersion,
  };
  // Write atomically: tmp file then rename. Avoids partial writes being read
  // by a concurrent analyzer (e.g. CLI + desktop app sharing the cache).
  await Promise.all([
    atomicWrite(path.join(location.dir, 'manifest.bin'), serialize(manifest)),
    atomicWrite(path.join(location.dir, 'scan.bin'), serialize(scan)),
    atomicWrite(path.join(location.dir, 'meta.json'), Buffer.from(JSON.stringify(meta, null, 2))),
  ]);
}

async function atomicWrite(target: string, data: Buffer): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, target);
}

/**
 * Remove every entry under the cache root for the given project. Intended
 * for `archora cache clear`. Use `clearAll` to wipe the entire root
 * (cross-project).
 */
export async function clearProjectCache(location: CacheLocation): Promise<void> {
  await fs.rm(location.root, { recursive: true, force: true });
}

export interface AnalyzeWithCacheOptions extends AnalyzeOptions {
  /** Project root (absolute). Required for cache I/O. */
  rootPath: string;
  /** Frontscope tool version for cache key. */
  toolVersion: string;
  /** Raw text of the project tsconfig (any variant). */
  tsconfigText?: string;
  /** Stringified `dependencies` + `devDependencies` from `package.json`. */
  packageDeps?: string;
  /** Raw text of `.archora.json` / `archora.config.json`. */
  frontScopeConfigText?: string;
  /**
   * Override the auto-resolved cache directory. Useful in tests or for
   * shared/team caches.
   */
  cacheDir?: string;
}

export type CacheOutcome =
  | { kind: 'miss' }
  | { kind: 'fresh'; from: 'cache' }
  | { kind: 'incremental'; changed: number; removed: number }
  | { kind: 'invalidated'; reason: 'added-files' | 'config-change' | 'corrupt-cache' };

export interface AnalyzeWithCacheResult {
  scan: ScanResult;
  outcome: CacheOutcome;
  /** Absolute path to the cache entry directory. */
  cacheDir: string;
}

/**
 * Orchestrate `loadCache` → stat-diff → `incrementalAnalyze` (or full
 * `analyze`) → `saveCache`. The wrapper owns Node FS so the analyzer core
 * can stay FileSource-pure.
 *
 * Behaviour:
 * - Cache miss (no entry, version skew, or key change): full `analyze()`,
 *   then save.
 * - Cache hit, no filesystem changes: returns the cached `ScanResult`
 *   verbatim - the warm path. ~zero work beyond stat'ing N files.
 * - Cache hit with only `changed`/`removed` files: `incrementalAnalyze` with
 *   those sets. The analyzer itself bails on tricky cases (config files,
 *   glob/prefix imports, template refs) and we re-save afterwards.
 * - Cache hit with `added` files: full `analyze()` (resolve-failed warnings
 *   on the previous scan could now resolve to the new files; we don't track
 *   that yet). Result is saved.
 *
 * The function never throws on cache I/O: corrupt or unreadable caches fall
 * through to a full scan and overwrite the bad entry on save.
 */
export async function analyzeWithCache(
  source: FileSource,
  opts: AnalyzeWithCacheOptions,
): Promise<AnalyzeWithCacheResult> {
  const keyInputs: CacheKeyInputs = {
    rootPath: opts.rootPath,
    toolVersion: opts.toolVersion,
    ...(opts.tsconfigText !== undefined ? { tsconfigText: opts.tsconfigText } : {}),
    ...(opts.packageDeps !== undefined ? { packageDeps: opts.packageDeps } : {}),
    ...(opts.frontScopeConfigText !== undefined
      ? { frontScopeConfigText: opts.frontScopeConfigText }
      : {}),
  };
  const location = opts.cacheDir
    ? {
        dir: opts.cacheDir,
        root: path.dirname(opts.cacheDir),
        cacheKey: computeCacheKey(keyInputs),
      }
    : await resolveCacheLocation(keyInputs);

  const analyzeOpts: AnalyzeOptions = {
    ...(opts.topHotZones !== undefined ? { topHotZones: opts.topHotZones } : {}),
    ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
    ...(opts.discover ? { discover: opts.discover } : {}),
  };

  const cached = await loadCache(location);

  // Fresh full scan: no usable cache.
  if (!cached) {
    const scan = await analyze(source, analyzeOpts);
    const manifest = await buildManifestFromScan(opts.rootPath, scan);
    await saveCache(location, scan, manifest, opts.toolVersion);
    return { scan, outcome: { kind: 'miss' }, cacheDir: location.dir };
  }

  // Discover the current file set. We reuse `discoverFiles` so cache + cold
  // path see exactly the same ignore rules.
  const { files: currentList } = await discoverFiles(source, analyzeOpts.discover);
  const current = await statFiles(opts.rootPath, currentList);
  const diff = diffAgainstManifest(cached.manifest, current);

  // Warm path: identical filesystem state.
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    return { scan: cached.scan, outcome: { kind: 'fresh', from: 'cache' }, cacheDir: location.dir };
  }

  // Incremental fast-path attempt. `incrementalAnalyze` will fall back to a
  // full scan internally on any condition it can't handle, so we don't need
  // to second-guess it here.
  const next = await incrementalAnalyze({
    prev: cached.scan,
    source,
    changedFiles: diff.changed,
    addedFiles: diff.added,
    removedFiles: diff.removed,
    options: analyzeOpts,
  });

  const manifest: CacheManifest = { files: current };
  await saveCache(location, next, manifest, opts.toolVersion);

  // Distinguish incremental from forced-full. The analyzer doesn't tell us
  // which path it took, so we infer: if there were `added` files or if
  // changed/removed include config files, it bailed to full. Otherwise the
  // fast path *probably* ran. Used for diagnostic logging only - functional
  // result is identical.
  if (diff.added.length > 0) {
    return {
      scan: next,
      outcome: { kind: 'invalidated', reason: 'added-files' },
      cacheDir: location.dir,
    };
  }
  return {
    scan: next,
    outcome: { kind: 'incremental', changed: diff.changed.length, removed: diff.removed.length },
    cacheDir: location.dir,
  };
}

/**
 * Build a fresh manifest by stat'ing every module that ended up in the scan.
 * We don't ask the FileSource for its full list again here - cheaper to just
 * stat what `analyze()` already enumerated.
 */
async function buildManifestFromScan(rootPath: string, scan: ScanResult): Promise<CacheManifest> {
  const rels = scan.modules.map((m) => m.id);
  const files = await statFiles(rootPath, rels);
  return { files };
}

export async function cacheRootSize(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) {
        files++;
        try {
          const st = await fs.stat(full);
          bytes += st.size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(root);
  return { files, bytes };
}
