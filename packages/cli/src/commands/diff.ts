import { writeFile } from 'node:fs/promises';
import { analyze, diffScans } from '@archora/core';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { resolveProjectPath } from './analyze';
import { loadScan } from '../lib/loadScan';

/**
 * `archora diff <path> --base <baseline.json>` - analyse the project
 * and emit a `ScanDiff` against a previously-saved snapshot.
 */
export async function runDiff(parsed: ParsedArgv): Promise<number> {
  const baseline = flagString(parsed, 'base') ?? flagString(parsed, 'baseline');
  if (!baseline) {
    process.stderr.write('error: --base <baseline.json> is required for `diff`\n');
    return 2;
  }
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const quiet = flagBool(parsed, 'quiet');

  const projectPath = resolveProjectPath(parsed);
  const baselineScan = await loadScan(baseline);

  if (!quiet) console.error(`Scanning ${projectPath} …`);
  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const next = await analyze(source);
  const diff = diffScans(baselineScan, next);

  const json = JSON.stringify(diff, null, 2);
  if (out) {
    await writeFile(out, json, 'utf-8');
    if (!quiet) console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(json);
    process.stdout.write('\n');
  }

  if (!quiet) {
    const s = diff.summary;
    console.error(
      `Diff: +${s.addedModules} / -${s.removedModules} modules, ${s.changedModules} changed, +${s.newCycles} / -${s.resolvedCycles} cycles.`,
    );
  }
  return 0;
}
