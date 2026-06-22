import { writeFile } from 'node:fs/promises';
import { buildOwnershipView } from '@archora/core';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { readScanInput } from '../lib/readScanInput';

type OwnershipFormat = 'json' | 'md' | 'markdown';

export async function runOwnership(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'md').toLowerCase() as OwnershipFormat;
  const top = parsePositiveInt(flagString(parsed, 'top')) ?? 20;

  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const { scan } = await readScanInput(parsed, quiet);
  const view = buildOwnershipView(scan);
  const body =
    format === 'json'
      ? JSON.stringify(view, null, 2)
      : renderOwnershipMarkdown(scan.project.name, view, top);

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

function renderOwnershipMarkdown(
  projectName: string,
  view: ReturnType<typeof buildOwnershipView>,
  top: number,
): string {
  const lines: string[] = [];
  lines.push(`# Ownership map - ${projectName}`);
  lines.push('');
  lines.push('| Area | Modules | Findings | Primary role | Risk | Owner hint |');
  lines.push('|---|---:|---:|---|---:|---|');
  for (const area of view.areas.slice(0, top)) {
    lines.push(
      `| \`${area.area}\` | ${area.modules} | ${area.findings} | ${area.primaryKind} | ${area.riskScore.toFixed(1)} | \`${area.ownerHint}\` |`,
    );
  }
  if (view.areas.length > top) {
    lines.push(`| _and ${view.areas.length - top} more_ |  |  |  |  |  |`);
  }
  if (view.drift.length > 0) {
    lines.push('');
    lines.push('## Drift candidates');
    lines.push('');
    for (const area of view.drift.slice(0, top)) {
      lines.push(`- \`${area.area}\`: ${area.findings}/${area.modules} modules carry findings.`);
    }
  }
  if (view.unownedHotspots.length > 0) {
    lines.push('');
    lines.push('## Hotspots without clear area');
    lines.push('');
    for (const id of view.unownedHotspots.slice(0, top)) lines.push(`- \`${id}\``);
  }
  return lines.join('\n');
}
