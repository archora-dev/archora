import {
  analyze,
  diffScans,
  loadArchoraConfig,
  type ScanDiff,
  type ScanResult,
} from '@archora/core';
import { parseBundleStats, type ParsedBundleStats } from '@archora/core/analyzer/bundle';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, flagString, flagStringList, type ParsedArgv } from '../argv';
import { resolveProjectPath } from './analyze';
import { loadScan } from '../lib/loadScan';
import { parseFailOn, type FailOnContext, type FailOnRule } from '../lib/failOn';
import { describeArchitectureBudget, evaluateArchitectureBudget } from '../lib/architectureBudget';

// `archora check <path> --fail-on <rule> ...` - CI-gate command.
// Exits non-zero if any rule trips. Output: one line per failed rule + summary.
export async function runCheck(parsed: ParsedArgv): Promise<number> {
  const ruleStrings = flagStringList(parsed, 'fail-on');

  let rules: FailOnRule[];
  try {
    rules = ruleStrings.map(parseFailOn);
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const projectPath = resolveProjectPath(parsed);
  const baseline = flagString(parsed, 'base') ?? flagString(parsed, 'baseline');
  const quiet = flagBool(parsed, 'quiet');

  if (!quiet) console.error(`Scanning ${projectPath} …`);
  const bundleStats = await loadBundleStats(parsed, projectPath, quiet);
  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const config = await loadArchoraConfig(source);
  if (rules.length === 0 && !config.architectureBudget) {
    process.stderr.write(
      'error: at least one --fail-on <rule> or .archora.json architectureBudget is required. Examples: --fail-on grade:D, --fail-on cycles:0, --fail-on new-cycles:0, --fail-on new-layer-violations:0, --fail-on new-contract-violations:0\n',
    );
    return 2;
  }
  const scan = await analyze(source, bundleStats ? { bundleStats } : {});

  let diff: ScanDiff | null = null;
  let baselineScan: ScanResult | null = null;
  if (baseline) {
    baselineScan = await loadScan(baseline);
    diff = diffScans(baselineScan, scan);
  }
  const context: FailOnContext = { diff, baseline: baselineScan };

  const failed: FailOnRule[] = [];
  for (const rule of rules) {
    if (rule.evaluate(scan, context)) failed.push(rule);
  }
  const budgetResult = evaluateArchitectureBudget(config, scan, context);

  if (failed.length === 0 && !budgetResult.failed) {
    if (!quiet) {
      console.error(
        `OK: ${rules.length} rule(s) and architecture budget passed. Grade ${scan.archDebt.grade}, ${scan.cycles.length} cycles, ${scan.layerViolations.length} violations.`,
      );
    }
    return 0;
  }

  process.stderr.write(`FAIL: ${failed.length}/${rules.length} rule(s) tripped\n`);
  for (const rule of failed) {
    process.stderr.write(`  - ${rule.raw} → ${rule.describe(scan, context)}\n`);
  }
  if (budgetResult.failed) {
    process.stderr.write(`  - architectureBudget → ${describeArchitectureBudget(budgetResult)}\n`);
  }
  return 1;
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
    if (out.format === 'unknown' && !quiet) {
      console.error(
        `warning: ${abs} is not a recognized bundle stats format (webpack/rollup-visualizer).`,
      );
    }
    return out;
  } catch (err) {
    process.stderr.write(
      `error: failed to read --bundle-stats ${abs}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }
}
