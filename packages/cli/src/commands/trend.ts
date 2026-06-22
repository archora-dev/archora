import { writeFile } from 'node:fs/promises';
import { buildTrendView } from '@archora/core';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { loadScan } from '../lib/loadScan';
import { readScanInput } from '../lib/readScanInput';

type TrendFormat = 'json' | 'md' | 'markdown';

export async function runTrend(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'md').toLowerCase() as TrendFormat;
  const baselinePath = flagString(parsed, 'base') ?? flagString(parsed, 'baseline');

  if (!baselinePath) {
    process.stderr.write('error: trend requires --base <scan.json>.\n');
    return 2;
  }
  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const baseline = await loadScan(baselinePath);
  const { scan } = await readScanInput(parsed, quiet);
  const view = buildTrendView(baseline, scan);
  const body =
    format === 'json'
      ? JSON.stringify(view, null, 2)
      : renderTrendMarkdown(scan.project.name, view);

  if (out) {
    await writeFile(out, body, 'utf-8');
    if (!quiet) console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }
  return 0;
}

function renderTrendMarkdown(projectName: string, view: ReturnType<typeof buildTrendView>): string {
  const lines: string[] = [];
  lines.push(`# Architecture trend - ${projectName}`);
  lines.push('');
  lines.push(`Direction: **${view.direction}**.`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| Debt score delta | ${view.summary.scoreDelta} |`);
  lines.push(`| Grade before | ${view.summary.gradeBefore} |`);
  lines.push(`| Grade after | ${view.summary.gradeAfter} |`);
  lines.push(`| Added modules | ${view.summary.addedModules} |`);
  lines.push(`| Changed modules | ${view.summary.changedModules} |`);
  lines.push(`| Removed modules | ${view.summary.removedModules} |`);
  lines.push(`| New cycles | ${view.summary.newCycles} |`);
  lines.push(`| Resolved cycles | ${view.summary.resolvedCycles} |`);
  lines.push(`| New signals | ${view.summary.newSignals} |`);
  lines.push(`| Regressed signals | ${view.summary.regressedSignals} |`);
  lines.push(`| Resolved signals | ${view.summary.resolvedSignals} |`);
  if (view.changes.length > 0) {
    lines.push('');
    lines.push('## Changes');
    lines.push('');
    for (const change of view.changes) lines.push(`- ${change}`);
  }
  return lines.join('\n');
}
