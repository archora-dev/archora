import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { analyze, buildJsonReport } from '@archora/core';
import { parseBundleStats, type ParsedBundleStats } from '@archora/core/analyzer/bundle';
import { readGitHistory, GitNotAvailableError } from '@archora/core/git';
import type { GitHistory } from '@archora/core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { analyzeWithCache, type CacheOutcome } from '@archora/core/cache';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { loadCacheInputs } from '../lib/cacheInputs';
import {
  asyncLifecycleRiskKindLabel,
  asyncLifecycleRiskSource,
} from '../lib/asyncLifecycleRiskText';
import { memoryRiskKindLabel, memoryRiskSource } from '../lib/memoryRiskText';

export async function runAnalyze(parsed: ParsedArgv): Promise<number> {
  const projectPath = resolveProjectPath(parsed);
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  // Cache is on by default. `--no-cache` disables persistence and forces a
  // cold scan. Using `cache=false` keeps both hot-path and persistence off,
  // matching the way bundlers expose this knob.
  const cacheEnabled = flagBool(parsed, 'cache', true);

  if (!quiet) console.error(`Scanning ${projectPath} …`);

  const bundleStats = await loadBundleStats(parsed, projectPath, quiet);
  const gitHistory = await loadGitHistory(parsed, projectPath, quiet);
  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const start = Date.now();

  let scan;
  let outcome: CacheOutcome | null = null;
  // Bundle stats and git history both feed in run-time data the cache can't
  // hash cheaply; skip the persistent cache when either is in play.
  if (cacheEnabled && !bundleStats && !gitHistory) {
    const inputs = await loadCacheInputs(projectPath);
    const result = await analyzeWithCache(source, {
      rootPath: projectPath,
      toolVersion: inputs.toolVersion,
      ...(inputs.tsconfigText !== undefined ? { tsconfigText: inputs.tsconfigText } : {}),
      ...(inputs.packageDeps !== undefined ? { packageDeps: inputs.packageDeps } : {}),
      ...(inputs.frontScopeConfigText !== undefined
        ? { frontScopeConfigText: inputs.frontScopeConfigText }
        : {}),
    });
    scan = result.scan;
    outcome = result.outcome;
  } else {
    scan = await analyze(source, {
      ...(bundleStats ? { bundleStats } : {}),
      ...(gitHistory ? { gitHistory } : {}),
    });
  }
  const took = Date.now() - start;

  const json = buildJsonReport(scan);

  if (out) {
    await ensureParentDir(out);
    await writeFile(out, json, 'utf-8');
    if (!quiet) console.error(`Wrote ${out} in ${took} ms.${cacheTag(outcome)}`);
  } else {
    process.stdout.write(json);
    process.stdout.write('\n');
  }

  if (!quiet) {
    console.error(
      `Done: ${scan.modules.length} modules, ${scan.edges.length} edges, ${scan.cycles.length} cycles, grade ${scan.archDebt.grade}.${cacheTag(outcome)}`,
    );
    printMemoryRiskSummary(scan);
    printAsyncLifecycleRiskSummary(scan);
  }
  return 0;
}

function printAsyncLifecycleRiskSummary(scan: Awaited<ReturnType<typeof analyze>>): void {
  const risks = scan.asyncLifecycleRisks ?? [];
  if (risks.length === 0) return;
  console.error(`Async lifecycle risks: ${risks.length}`);
  for (const risk of risks.slice(0, 3)) {
    console.error(
      `- ${asyncLifecycleRiskKindLabel(risk.kind)} [${risk.confidence}] ${asyncLifecycleRiskSource(risk)}`,
    );
  }
  if (risks.length > 3) console.error(`- … and ${risks.length - 3} more`);
}

function printMemoryRiskSummary(scan: Awaited<ReturnType<typeof analyze>>): void {
  const risks = scan.memoryRisks ?? [];
  if (risks.length === 0) return;
  console.error(`Memory risks: ${risks.length}`);
  for (const risk of risks.slice(0, 3)) {
    console.error(
      `- ${memoryRiskKindLabel(risk.kind)} [${risk.confidence}] ${memoryRiskSource(risk)}`,
    );
  }
  if (risks.length > 3) console.error(`- … and ${risks.length - 3} more`);
}

function cacheTag(outcome: CacheOutcome | null): string {
  if (!outcome) return '';
  switch (outcome.kind) {
    case 'fresh':
      return ' (cache hit, no changes)';
    case 'incremental':
      return ` (cache hit, ${outcome.changed} changed, ${outcome.removed} removed)`;
    case 'invalidated':
      return ` (cache invalidated: ${outcome.reason})`;
    case 'miss':
      return ' (cache miss, full scan)';
  }
}

export function resolveProjectPath(parsed: ParsedArgv): string {
  const positional = parsed.positional[0] ?? '.';
  return resolve(process.cwd(), positional);
}

async function ensureParentDir(filePath: string): Promise<void> {
  const dir = dirname(resolve(filePath));
  await mkdir(dir, { recursive: true });
}

/**
 * Resolve the `--git-history` / `--git-since` flags. Default behaviour:
 * git history is *off* unless the user opts in with `--git-history`. We
 * intentionally do not auto-enable on `.git/` presence — many monorepos
 * have huge histories and we don't want to slow `analyze` for users who
 * don't care about churn yet.
 */
export async function loadGitHistory(
  parsed: ParsedArgv,
  projectPath: string,
  quiet: boolean,
): Promise<GitHistory | undefined> {
  const enabled = flagBool(parsed, 'git-history');
  if (!enabled) return undefined;
  if (!existsSync(join(projectPath, '.git'))) {
    if (!quiet)
      console.error(`warning: --git-history set but ${projectPath} is not a git repo. Skipping.`);
    return undefined;
  }
  const since = flagString(parsed, 'git-since') ?? '90d';
  try {
    const history = await readGitHistory({ rootPath: projectPath, since });
    if (!quiet)
      console.error(`Git history: ${history.commits.length} commits since "${history.since}".`);
    return history;
  } catch (err) {
    if (err instanceof GitNotAvailableError) {
      if (!quiet) console.error(`warning: ${err.message}. Skipping --git-history.`);
      return undefined;
    }
    process.stderr.write(
      `error: --git-history failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }
}

async function loadBundleStats(
  parsed: ParsedArgv,
  rootPath: string,
  quiet: boolean,
): Promise<ParsedBundleStats | undefined> {
  const path = flagString(parsed, 'bundle-stats');
  if (!path) return undefined;
  const abs = resolve(rootPath, path);
  try {
    const text = await readFile(abs, 'utf-8');
    const json = JSON.parse(text) as unknown;
    const out = parseBundleStats(json, { rootPath });
    if (out.format === 'unknown') {
      if (!quiet)
        console.error(
          `warning: ${abs} is not a recognized bundle stats format (webpack/rollup-visualizer).`,
        );
    } else if (!quiet) {
      console.error(`Bundle stats: ${out.format}, ${out.chunks.length} chunks.`);
    }
    return out;
  } catch (err) {
    process.stderr.write(
      `error: failed to read --bundle-stats ${abs}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }
}
