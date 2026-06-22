import { writeFile } from 'node:fs/promises';
import { buildLifecycleHygieneView } from '@archora/core';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { readScanInput } from '../lib/readScanInput';

type HygieneFormat = 'json' | 'md' | 'markdown';

export async function runHygiene(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'md').toLowerCase() as HygieneFormat;
  const top = parsePositiveInt(flagString(parsed, 'top')) ?? 20;

  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const { scan } = await readScanInput(parsed, quiet);
  const view = buildLifecycleHygieneView(scan);
  const body =
    format === 'json'
      ? JSON.stringify(view, null, 2)
      : renderHygieneMarkdown(scan.project.name, view, top);

  if (out) {
    await writeFile(out, body, 'utf-8');
    if (!quiet) console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }
  return 0;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || String(n) !== value || n < 1) return undefined;
  return n;
}

function renderHygieneMarkdown(
  projectName: string,
  view: ReturnType<typeof buildLifecycleHygieneView>,
  top: number,
): string {
  const lines: string[] = [];
  lines.push(`# Lifecycle hygiene - ${projectName}`);
  lines.push('');
  lines.push('| Area | Count |');
  lines.push('|---|---:|');
  lines.push(`| Detached modules | ${view.summary.removableCandidates} |`);
  lines.push(`| Entry candidates | ${view.summary.entryCandidates} |`);
  lines.push(`| Generated pressure | ${view.summary.generatedPressure} |`);
  lines.push(`| Memory risks | ${view.summary.memoryRisks} |`);
  lines.push(`| Async lifecycle risks | ${view.summary.asyncLifecycleRisks} |`);
  lines.push(`| Lifecycle risk modules | ${view.summary.lifecycleRiskModules} |`);
  lines.push(`| Side-effect owners | ${view.summary.sideEffectOwners} |`);
  lines.push('');
  appendSideEffectOwnershipSection(lines, view.sideEffectOwners, top);
  appendLifecycleRiskSection(lines, view.lifecycleRiskModules, top);
  appendSection(lines, 'Detached modules', view.removableCandidates, top);
  appendSection(lines, 'Entry candidates', view.entryCandidates, top);
  appendSection(lines, 'Generated pressure', view.generatedPressure, top);
  return lines.join('\n');
}

function appendSideEffectOwnershipSection(
  lines: string[],
  items: ReturnType<typeof buildLifecycleHygieneView>['sideEffectOwners'],
  top: number,
): void {
  if (items.length === 0) return;
  lines.push('## Side-effect ownership');
  lines.push('');
  lines.push('| Module | Owner | Layer | Role | Placement | Memory | Async lifecycle |');
  lines.push('|---|---|---|---|---|---:|---:|');
  for (const item of items.slice(0, top)) {
    lines.push(
      `| \`${item.id}\` | ${item.owner} | ${item.layer} | ${item.kind} | ${item.placement} | ${item.memoryRisks} | ${item.asyncLifecycleRisks} |`,
    );
  }
  lines.push('');
}

function appendLifecycleRiskSection(
  lines: string[],
  items: ReturnType<typeof buildLifecycleHygieneView>['lifecycleRiskModules'],
  top: number,
): void {
  if (items.length === 0) return;
  lines.push('## Lifecycle risk modules');
  lines.push('');
  lines.push('| Module | Memory | Async lifecycle | Confidence | Severity |');
  lines.push('|---|---:|---:|---|---|');
  for (const item of items.slice(0, top)) {
    lines.push(
      `| \`${item.id}\` | ${item.memoryRisks} | ${item.asyncLifecycleRisks} | ${item.confidence} | ${item.severity} |`,
    );
  }
  lines.push('');
}

function appendSection(
  lines: string[],
  title: string,
  items: ReturnType<typeof buildLifecycleHygieneView>['removableCandidates'],
  top: number,
): void {
  if (items.length === 0) return;
  lines.push(`## ${title}`);
  lines.push('');
  for (const item of items.slice(0, top)) {
    lines.push(
      `- \`${item.id}\`: fan-in ${item.fanIn}, fan-out ${item.fanOut}, exports ${item.exports}, LOC ${item.loc}.`,
    );
  }
  lines.push('');
}
