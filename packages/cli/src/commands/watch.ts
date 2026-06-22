// `archora watch <path>` - long-running mode that re-runs analysis on
// every filesystem change. Designed for headless / CI scenarios that need
// to observe project stability before deploying. Streams JSON envelopes
// (one per scan, newline-delimited) to stdout.
//
// Implementation:
//  - Initial scan via `analyzeWithCache` (warm-start friendly).
//  - `node:fs.watch(root, { recursive: true })` on Linux 20+ / macOS / Windows
//    for file events; we filter by extension and gitignore rules
//    `discoverFiles` would have applied. No external dependencies (no
//    chokidar) - the stdlib is sufficient for the supported OSes.
//  - Per-event 200ms debounce coalesces IDE save-all bursts; the cache
//    pipeline then derives the actual changed/added/removed sets via stat
//    diff, so we don't have to reason about event semantics here.

import { watch } from 'node:fs';
import { buildJsonReport } from '@archora/core';
import { analyzeWithCache, type AnalyzeWithCacheResult } from '@archora/core/cache';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, type ParsedArgv } from '../argv';
import { loadCacheInputs } from '../lib/cacheInputs';
import { resolveProjectPath } from './analyze';

const DEBOUNCE_MS = 200;
const SUPPORTED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.mjs', '.cjs'];

export async function runWatch(parsed: ParsedArgv): Promise<number> {
  const projectPath = resolveProjectPath(parsed);
  const quiet = flagBool(parsed, 'quiet');
  const once = flagBool(parsed, 'once'); // single rescan and exit (mostly for tests)

  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const inputs = await loadCacheInputs(projectPath);

  let running = false;
  let pending = false;

  async function rescan(reason: string): Promise<void> {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const start = Date.now();
      const result: AnalyzeWithCacheResult = await analyzeWithCache(source, {
        rootPath: projectPath,
        toolVersion: inputs.toolVersion,
        ...(inputs.tsconfigText !== undefined ? { tsconfigText: inputs.tsconfigText } : {}),
        ...(inputs.packageDeps !== undefined ? { packageDeps: inputs.packageDeps } : {}),
        ...(inputs.frontScopeConfigText !== undefined
          ? { frontScopeConfigText: inputs.frontScopeConfigText }
          : {}),
      });
      const took = Date.now() - start;
      const envelope = buildJsonReport(result.scan);
      // Newline-delimited JSON: one full envelope per scan.
      process.stdout.write(envelope);
      process.stdout.write('\n');
      if (!quiet) {
        process.stderr.write(
          `[${new Date().toISOString()}] ${reason} → ${describeOutcome(result)} in ${took}ms\n`,
        );
      }
    } catch (e) {
      process.stderr.write(`watch: scan failed: ${formatError(e)}\n`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        // Coalesce the queued rescan onto the next tick.
        setImmediate(() => void rescan('queued'));
      }
    }
  }

  await rescan('initial');
  if (once) return 0;

  let timer: NodeJS.Timeout | null = null;
  let touched = false;

  const watcher = watch(projectPath, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    if (!isSupportedExt(filename)) return;
    if (filename.includes('node_modules') || filename.includes('.git')) return;
    touched = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!touched) return;
      touched = false;
      void rescan('fs-change');
    }, DEBOUNCE_MS);
  });

  watcher.on('error', (err) => {
    process.stderr.write(`watch: watcher error: ${formatError(err)}\n`);
  });

  // Keep the process alive until SIGINT/SIGTERM.
  await new Promise<void>((resolveExit) => {
    const cleanup = (): void => {
      watcher.close();
      if (timer) clearTimeout(timer);
      resolveExit();
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  });
  return 0;
}

function isSupportedExt(name: string): boolean {
  // node's fs.watch returns a path-relative name; we want only source files.
  const lower = name.toLowerCase();
  for (const ext of SUPPORTED_EXTS) if (lower.endsWith(ext)) return true;
  return false;
}

function describeOutcome(r: AnalyzeWithCacheResult): string {
  switch (r.outcome.kind) {
    case 'fresh':
      return `cache-fresh (${r.scan.modules.length} modules)`;
    case 'incremental':
      return `incremental (${r.outcome.changed} changed, ${r.outcome.removed} removed)`;
    case 'invalidated':
      return `full (${r.outcome.reason})`;
    case 'miss':
      return `full (${r.scan.modules.length} modules, cache miss)`;
  }
}

function formatError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
