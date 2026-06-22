/**
 * Scale benchmarks for the analyzer.
 *
 * Runs `analyze()` on synthetic projects of varying size and measures:
 *   - Cold scan time (analyze() from start to ScanResult)
 *   - Peak process RSS
 *   - Graph size (modules, edges, cycles)
 *
 * Threshold gate for CI:
 *   3k:  cold ≤ 5s,  RSS ≤ 350 MB
 *   10k: cold ≤ 15s, RSS ≤ 600 MB
 *   30k: cold ≤ 30s, RSS ≤ 1200 MB
 *
 * Note: layout time and render FPS are not measured here — both require a
 * WebGL runtime (Tauri/browser), and measuring them is fundamentally a
 * separate task for UI benchmarks. This covers only the Node-side analyze.
 *
 * Usage:
 *   npm run bench:scale                    # all three sizes
 *   npm run bench:scale -- --size 3000     # only 3k
 *   npm run bench:scale -- --threshold     # CI gate (exit 1 on breach)
 *   npm run bench:scale -- --json          # machine-readable report to stdout
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { analyze } from '../packages/core/src/analyzer';
import {
  analyzeWithCache,
  clearProjectCache,
  resolveCacheLocation,
} from '../packages/core/src/cache';
import { createNodeFsFileSource } from '../packages/core/src/analyzer/sources/nodeFsFileSource';
import { ensureSynthProject } from './synth-large';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const REPORT_DIR = join(REPO_ROOT, 'dist', 'benchmarks');

interface ScaleResult {
  size: number;
  modules: number;
  edges: number;
  cycles: number;
  scanMs: number;
  /** Time of a second `analyzeWithCache()` call when no files changed. */
  warmMs: number;
  /** Time of a third call after touching ~1% of files (incremental fast-path). */
  incrementalMs: number;
  /** Persisted cache size on disk (manifest + scan). */
  cacheBytes: number;
  peakRssMb: number;
  warnings: number;
}

interface Threshold {
  size: number;
  scanMs: number;
  /** Maximum acceptable time for a no-change warm scan. */
  warmMs: number;
  peakRssMb: number;
}

// Warm thresholds are intentionally generous: even with full ScanResult
// deserialization, every order of magnitude under cold-scan is a win. The
// numbers are ceilings to catch regressions, not targets.
const THRESHOLDS: Threshold[] = [
  { size: 3_000, scanMs: 5_000, warmMs: 500, peakRssMb: 350 },
  { size: 10_000, scanMs: 15_000, warmMs: 1_500, peakRssMb: 600 },
  { size: 30_000, scanMs: 30_000, warmMs: 3_500, peakRssMb: 1_200 },
];

interface Args {
  sizes: number[];
  threshold: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sizes: [3_000, 10_000, 30_000], threshold: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--size') {
      args.sizes = [Number(argv[++i])];
    } else if (a === '--threshold') {
      args.threshold = true;
    } else if (a === '--json') {
      args.json = true;
    }
  }
  return args;
}

async function runOne(size: number): Promise<ScaleResult> {
  const projectDir = await ensureSynthProject(size);
  if (!process.env['SCALE_BENCH_QUIET']) {
    console.log(`[scale] size=${size} project=${projectDir.replace(REPO_ROOT, '.')}`);
  }

  // Place the cache outside the synth project (no node_modules there) and
  // wipe it before measuring cold so the first analyzeWithCache call is a
  // genuine miss. We use a stable per-size dir under tmp so successive runs
  // overwrite each other without leaking GBs.
  const cacheDir = join(tmpdir(), 'archora-scale-bench-cache', `size-${size}`);
  const location = await resolveCacheLocation({ rootPath: projectDir, toolVersion: 'bench' });
  await clearProjectCache(location);
  await fsp.rm(cacheDir, { recursive: true, force: true });

  // Measure peak RSS via periodic sampling (every 50ms).
  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    const cur = process.memoryUsage().rss;
    if (cur > peakRss) peakRss = cur;
  }, 50);

  // Cold scan via cache wrapper - this also writes the cache. Fall back to
  // plain analyze() for the older measurement equivalence (the wrapper adds
  // a one-shot `discoverFiles` over the same source which is < 100ms).
  const t0 = performance.now();
  const source = await createNodeFsFileSource({ rootPath: projectDir });
  const cold = await analyzeWithCache(source, {
    rootPath: projectDir,
    toolVersion: 'bench',
  });
  const scanMs = Math.round(performance.now() - t0);
  clearInterval(sampler);

  // Warm scan: same files, cache hit, no work expected beyond stat + load.
  const t1 = performance.now();
  const warmSource = await createNodeFsFileSource({ rootPath: projectDir });
  const warm = await analyzeWithCache(warmSource, {
    rootPath: projectDir,
    toolVersion: 'bench',
  });
  const warmMs = Math.round(performance.now() - t1);
  if (warm.outcome.kind !== 'fresh') {
    console.warn(`[scale] size=${size}: warm scan was not 'fresh' (got ${warm.outcome.kind})`);
  }

  // Incremental scan: touch ~1% of modules to simulate a typical IDE
  // refactor batch. Caps at 50 files - higher counts dominate the bench
  // without measuring anything new (incremental cost scales linearly).
  const touchCount = Math.min(50, Math.max(1, Math.round(cold.scan.modules.length / 100)));
  const touched = cold.scan.modules.slice(0, touchCount).map((m) => m.id);
  const now = new Date();
  for (const rel of touched) {
    try {
      await fsp.utimes(join(projectDir, rel), now, now);
    } catch {
      /* missing - skip */
    }
  }
  const t2 = performance.now();
  const incSource = await createNodeFsFileSource({ rootPath: projectDir });
  const inc = await analyzeWithCache(incSource, {
    rootPath: projectDir,
    toolVersion: 'bench',
  });
  const incrementalMs = Math.round(performance.now() - t2);
  if (inc.outcome.kind !== 'incremental') {
    console.warn(`[scale] size=${size}: expected 'incremental' outcome, got ${inc.outcome.kind}`);
  }

  const cacheBytes = await dirSize(location.dir);

  return {
    size,
    modules: cold.scan.modules.length,
    edges: cold.scan.edges.length,
    cycles: cold.scan.cycles.length,
    scanMs,
    warmMs,
    incrementalMs,
    cacheBytes,
    peakRssMb: Math.round(peakRss / (1024 * 1024)),
    warnings: cold.scan.warnings.length,
  };
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (e.isFile()) {
      try {
        const st = await fsp.stat(join(dir, e.name));
        total += st.size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

// Reference left to silence the linter when only `analyze` was used.
void analyze;

function checkThresholds(results: ScaleResult[]): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const r of results) {
    const t = THRESHOLDS.find((x) => x.size === r.size);
    if (!t) continue;
    if (r.scanMs > t.scanMs) {
      failures.push(`size=${r.size}: scanMs=${r.scanMs} > threshold=${t.scanMs}`);
    }
    if (r.warmMs > t.warmMs) {
      failures.push(`size=${r.size}: warmMs=${r.warmMs} > threshold=${t.warmMs}`);
    }
    if (r.peakRssMb > t.peakRssMb) {
      failures.push(`size=${r.size}: peakRssMb=${r.peakRssMb} > threshold=${t.peakRssMb}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

function formatTable(results: ScaleResult[]): string {
  const lines: string[] = [];
  lines.push(
    '| Size  | Modules | Edges  | Cycles | Cold     | Warm    | Incr.   | Cache   | Peak RSS  | Warnings |',
  );
  lines.push(
    '|-------|---------|--------|--------|----------|---------|---------|---------|-----------|----------|',
  );
  for (const r of results) {
    lines.push(
      `| ${String(r.size).padStart(5)} | ${String(r.modules).padStart(7)} | ${String(r.edges).padStart(6)} | ${String(r.cycles).padStart(6)} | ${(r.scanMs / 1000).toFixed(2).padStart(6)}s  | ${(r.warmMs / 1000).toFixed(2).padStart(5)}s | ${(r.incrementalMs / 1000).toFixed(2).padStart(5)}s | ${formatCacheSize(r.cacheBytes).padStart(7)} | ${String(r.peakRssMb).padStart(5)} MB  | ${String(r.warnings).padStart(8)} |`,
    );
  }
  return lines.join('\n');
}

function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const results: ScaleResult[] = [];

  for (const size of args.sizes) {
    const r = await runOne(size);
    results.push(r);
  }

  if (args.json) {
    console.log(JSON.stringify({ results, thresholds: THRESHOLDS }, null, 2));
  } else {
    console.log('\n' + formatTable(results) + '\n');
  }

  // Save a timestamped JSON report
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = join(REPORT_DIR, `scale-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({ results, thresholds: THRESHOLDS }, null, 2));
  if (!args.json) console.log(`report: ${reportPath.replace(REPO_ROOT, '.')}`);

  if (args.threshold) {
    const check = checkThresholds(results);
    if (!check.ok) {
      console.error('\nthreshold gate FAILED:');
      for (const f of check.failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    if (!args.json) console.log('threshold gate: OK');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
