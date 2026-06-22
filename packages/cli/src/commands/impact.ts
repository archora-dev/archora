import { writeFile } from 'node:fs/promises';
import { buildImpactView, findModuleMatches, resolveImpactTarget } from '@archora/core';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { readScanInput } from '../lib/readScanInput';

type ImpactFormat = 'json' | 'md' | 'markdown';

export async function runImpact(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'json').toLowerCase() as ImpactFormat;
  const query = flagString(parsed, 'module') ?? parsed.positional[1];
  const top = parsePositiveInt(flagString(parsed, 'top')) ?? 30;

  if (!query) {
    process.stderr.write('error: impact requires --module <module-id>.\n');
    return 2;
  }
  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const { scan } = await readScanInput(parsed, quiet);
  const target = resolveImpactTarget(scan, query);
  if (!target) {
    process.stderr.write(`error: module not found in scan: ${query}\n`);
    const matches = findModuleMatches(scan, query, 5);
    if (matches.length > 0) {
      process.stderr.write(
        `closest matches:\n${matches.map((item) => `  - ${item}`).join('\n')}\n`,
      );
    }
    return 2;
  }

  const impact = buildImpactView(scan, target);
  const body =
    format === 'json'
      ? JSON.stringify(impact, null, 2)
      : renderImpactMarkdown(scan.project.name, impact, top);

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

function renderImpactMarkdown(
  projectName: string,
  impact: ReturnType<typeof buildImpactView>,
  top: number,
): string {
  const lines: string[] = [];
  lines.push(`# Impact - ${projectName}`);
  lines.push('');
  lines.push(`Target: \`${impact.target}\``);
  lines.push(`Risk: **${impact.risk}**`);
  lines.push(
    `Metrics: fan-in **${impact.metrics.fanIn}**, fan-out **${impact.metrics.fanOut}**, instability **${impact.metrics.instability.toFixed(2)}**, hotness **${impact.metrics.hotnessScore.toFixed(1)}**.`,
  );
  lines.push('');
  lines.push('| Scope | Count |');
  lines.push('|---|---:|');
  lines.push(`| Direct imports | ${impact.imports.length} |`);
  lines.push(`| Direct importers | ${impact.importers.length} |`);
  lines.push(`| Affected modules | ${impact.affectedModules.length} |`);
  lines.push(`| Affected areas | ${impact.affectedAreas.length} |`);
  lines.push(`| Affected folders | ${impact.affectedFolders.length} |`);
  lines.push(`| Cycles touched | ${impact.cyclesTouched.length} |`);
  lines.push(`| Violations touched | ${impact.violationsTouched} |`);
  lines.push(`| Related signals | ${impact.relatedSignals.length} |`);
  lines.push('');
  renderList(lines, 'Direct importers', impact.importers, top);
  renderList(lines, 'Direct imports', impact.imports, top);
  renderList(lines, 'Affected modules', impact.affectedModules, top);
  renderList(lines, 'Affected areas', impact.affectedAreas, top);
  renderList(lines, 'Affected folders', impact.affectedFolders, top);
  renderList(lines, 'Cycles touched', impact.cyclesTouched, top);
  renderList(lines, 'Related signals', impact.relatedSignals, top);
  return lines.join('\n');
}

function renderList(lines: string[], title: string, values: readonly string[], top: number): void {
  if (values.length === 0) return;
  lines.push(`## ${title}`);
  lines.push('');
  for (const value of values.slice(0, top)) lines.push(`- \`${value}\``);
  if (values.length > top) lines.push(`- _and ${values.length - top} more_`);
  lines.push('');
}
