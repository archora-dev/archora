import { writeFile } from 'node:fs/promises';
import {
  analyze,
  buildFixPlan,
  buildJsonReport,
  diffScans,
  loadArchoraConfig,
  type ScanDiff,
  type ScanResult,
} from '@archora/core';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { loadGitHistory, resolveProjectPath } from './analyze';
import { loadScan } from '../lib/loadScan';
import { buildMarkdownReport } from '../exporters/markdown';
import { buildJUnitReport } from '../exporters/junit';
import { buildHtmlReport } from '../exporters/html';

type Format = 'md' | 'markdown' | 'junit' | 'html' | 'json' | 'fix-plan';

// `archora report <path> --format md|html|junit|json`. With `--base`
// markdown shows the diff against the baseline; junit/html show only the latest scan.
export async function runReport(parsed: ParsedArgv): Promise<number> {
  const format = (flagString(parsed, 'format') ?? 'md').toLowerCase() as Format;
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const baseline = flagString(parsed, 'base') ?? flagString(parsed, 'baseline');
  const quiet = flagBool(parsed, 'quiet');

  const projectPath = resolveProjectPath(parsed);
  if (!quiet) console.error(`Scanning ${projectPath} …`);
  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const gitHistory = await loadGitHistory(parsed, projectPath, quiet);
  const [scan, config] = await Promise.all([
    analyze(source, gitHistory ? { gitHistory } : {}),
    loadArchoraConfig(source),
  ]);

  let diff: ScanDiff | null = null;
  let prev: ScanResult | null = null;
  if (baseline) {
    prev = await loadScan(baseline);
    diff = diffScans(prev, scan);
  }

  let body: string;
  switch (format) {
    case 'md':
    case 'markdown':
      body = buildMarkdownReport(scan, diff, prev, config);
      break;
    case 'junit':
      body = buildJUnitReport(scan);
      break;
    case 'html':
      body = buildHtmlReport(scan);
      break;
    case 'json':
      body = buildJsonReport(scan);
      break;
    case 'fix-plan':
      body = JSON.stringify(buildFixPlan(scan), null, 2);
      break;
    default:
      process.stderr.write(
        `error: unknown --format "${format}". Use md, html, junit, json, or fix-plan.\n`,
      );
      return 2;
  }

  if (out) {
    await writeFile(out, body, 'utf-8');
    if (!quiet) console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }
  return 0;
}
