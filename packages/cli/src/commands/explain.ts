import { writeFile } from 'node:fs/promises';
import { buildExplainView, buildSignalBaselineView } from '@archora/core';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { loadScan } from '../lib/loadScan';
import { readScanInput } from '../lib/readScanInput';

type ExplainFormat = 'json' | 'md' | 'markdown';

export async function runExplain(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'md').toLowerCase() as ExplainFormat;

  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const { scan } = await readScanInput(parsed, quiet);
  const basePath = flagString(parsed, 'base');
  const baseline = basePath ? await loadScan(basePath) : null;
  const signal = flagString(parsed, 'signal');
  const cycle = flagString(parsed, 'cycle');
  const module = flagString(parsed, 'module') ?? parsed.positional[1];
  const view = buildExplainView(scan, {
    ...(signal ? { signal } : {}),
    ...(cycle ? { cycle } : {}),
    ...(module ? { module } : {}),
  });
  if (signal && view.kind !== 'signal') {
    process.stderr.write(`error: signal not found in scan: ${signal}\n`);
    return 2;
  }
  if (cycle && view.kind !== 'cycle') {
    process.stderr.write(`error: cycle not found in scan: ${cycle}\n`);
    return 2;
  }
  if (module && view.kind !== 'module') {
    process.stderr.write(`error: module not found in scan: ${module}\n`);
    return 2;
  }
  const baselineView = baseline ? buildSignalBaselineView(baseline, scan) : null;
  const body =
    format === 'json'
      ? JSON.stringify({ ...view, ...(baselineView ? { baseline: baselineView } : {}) }, null, 2)
      : renderExplainMarkdown(scan.project.name, view, baselineView);

  if (out) {
    await writeFile(out, body, 'utf-8');
    if (!quiet) console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }
  return 0;
}

function renderExplainMarkdown(
  projectName: string,
  view: ReturnType<typeof buildExplainView>,
  baseline: ReturnType<typeof buildSignalBaselineView> | null,
): string {
  const lines: string[] = [];
  lines.push(`# Explain - ${projectName}`);
  lines.push('');
  lines.push(`Kind: \`${view.kind}\``);
  lines.push(`Title: **${view.title}**`);
  if (view.severity) lines.push(`Severity: \`${view.severity}\``);
  if (view.confidence) lines.push(`Confidence: \`${view.confidence}\``);
  lines.push('');
  renderList(lines, 'Evidence', view.evidence);
  renderCycleDetails(lines, view);
  renderList(lines, 'Modules', view.modules);
  renderList(lines, 'Next steps', view.nextSteps);
  if (baseline) {
    lines.push('## Baseline');
    lines.push('');
    lines.push(`- New signals: ${baseline.newSignals.length}`);
    lines.push(`- Regressed signals: ${baseline.regressedSignals.length}`);
    lines.push(`- Resolved signals: ${baseline.resolved.length}`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderCycleDetails(lines: string[], view: ReturnType<typeof buildExplainView>): void {
  if (view.kind !== 'cycle' || !view.cycle) return;
  lines.push('## Cycle scope');
  lines.push('');
  lines.push(`- Areas: ${inlineCodeList(view.cycle.affectedAreas)}`);
  lines.push(`- Folders: ${inlineCodeList(view.cycle.affectedFolders)}`);
  lines.push(`- Layers: ${inlineCodeList(view.cycle.affectedLayers)}`);
  if (view.cycle.suggestedBreakpoint) {
    lines.push(
      `- Suggested break: \`${view.cycle.suggestedBreakpoint.from}\` -> \`${view.cycle.suggestedBreakpoint.to}\` (${view.cycle.suggestedBreakpoint.reason})`,
    );
  }
  lines.push('');
  if (view.cycle.edges.length === 0) return;
  lines.push('## Cycle path');
  lines.push('');
  lines.push('| Import | Kind | Layers | Folders | Signals |');
  lines.push('|---|---|---|---|---|');
  for (const edge of view.cycle.edges) {
    lines.push(
      `| \`${edge.from}\` -> \`${edge.to}\` | ${edge.kind} | \`${edge.fromLayer}\` -> \`${edge.toLayer}\` | \`${edge.fromFolder}\` -> \`${edge.toFolder}\` | ${cycleEdgeSignals(edge)} |`,
    );
  }
  lines.push('');
}

function inlineCodeList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(', ') : 'none';
}

function cycleEdgeSignals(
  edge: NonNullable<ReturnType<typeof buildExplainView>['cycle']>['edges'][number],
): string {
  const signals: string[] = [];
  if (edge.violatesBoundary) signals.push('violation');
  if (edge.crossesLayer) signals.push('cross-layer');
  return signals.length > 0 ? signals.join(', ') : 'normal';
}

function renderList(lines: string[], title: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`## ${title}`);
  lines.push('');
  for (const value of values.slice(0, 30))
    lines.push(`- ${title === 'Modules' ? `\`${value}\`` : value}`);
  if (values.length > 30) lines.push(`- _and ${values.length - 30} more_`);
  lines.push('');
}
