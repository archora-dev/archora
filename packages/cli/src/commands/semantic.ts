import { writeFile } from 'node:fs/promises';
import { buildSemanticSurfaceView } from '@archora/core';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { readScanInput } from '../lib/readScanInput';

type SemanticFormat = 'json' | 'md' | 'markdown';

export async function runSemantic(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'md').toLowerCase() as SemanticFormat;
  const top = parsePositiveInt(flagString(parsed, 'top')) ?? 20;

  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const { scan } = await readScanInput(parsed, quiet);
  const view = buildSemanticSurfaceView(scan);
  const body =
    format === 'json'
      ? JSON.stringify(view, null, 2)
      : renderSemanticMarkdown(scan.project.name, view, top);

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

function renderSemanticMarkdown(
  projectName: string,
  view: ReturnType<typeof buildSemanticSurfaceView>,
  top: number,
): string {
  const lines: string[] = [];
  lines.push(`# Semantic surface - ${projectName}`);
  lines.push('');
  renderModules(lines, 'Broad public modules', view.broadPublicModules, top);
  renderModules(lines, 'Quiet exports', view.quietExports, top);
  renderModules(lines, 'Type and schema clusters', view.typeClusters, top);
  if (
    view.broadPublicModules.length === 0 &&
    view.quietExports.length === 0 &&
    view.typeClusters.length === 0
  ) {
    lines.push('No semantic surface risks found.');
  }
  return lines.join('\n');
}

function renderModules(
  lines: string[],
  title: string,
  modules: ReturnType<typeof buildSemanticSurfaceView>['broadPublicModules'],
  top: number,
): void {
  if (modules.length === 0) return;
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| Module | Role | Exports | Fan-in | Fan-out | Risk |');
  lines.push('|---|---|---:|---:|---:|---:|');
  for (const item of modules.slice(0, top)) {
    lines.push(
      `| \`${item.id}\` | ${item.role} | ${item.exports} | ${item.fanIn} | ${item.fanOut} | ${item.risk.toFixed(1)} |`,
    );
  }
  if (modules.length > top) lines.push(`| _and ${modules.length - top} more_ |  |  |  |  |  |`);
  lines.push('');
}
