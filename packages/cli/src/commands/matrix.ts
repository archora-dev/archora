import { writeFile } from 'node:fs/promises';
import { buildMatrixView, type MatrixGrouping } from '@archora/core';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { readScanInput } from '../lib/readScanInput';

type MatrixFormat = 'json' | 'md' | 'markdown';

export async function runMatrix(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'json').toLowerCase() as MatrixFormat;
  const grouping = parseGrouping(flagString(parsed, 'group-by') ?? flagString(parsed, 'group'));
  const top = parsePositiveInt(flagString(parsed, 'top'));
  const onlyViolations = flagBool(parsed, 'only-violations');
  const onlyCycles = flagBool(parsed, 'only-cycles');

  if (!grouping) {
    process.stderr.write('error: --group-by must be area, layer, folder, or package.\n');
    return 2;
  }
  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const { scan } = await readScanInput(parsed, quiet);
  const matrix = buildMatrixView(scan, {
    groupBy: grouping,
    ...(top !== undefined ? { top } : {}),
    ...(onlyViolations ? { onlyViolations } : {}),
    ...(onlyCycles ? { onlyCycles } : {}),
  });
  const body =
    format === 'json'
      ? JSON.stringify(matrix, null, 2)
      : renderMatrixMarkdown(scan.project.name, matrix);

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

function parseGrouping(value: string | undefined): MatrixGrouping | null {
  const grouping = value ?? 'area';
  if (
    grouping === 'area' ||
    grouping === 'layer' ||
    grouping === 'folder' ||
    grouping === 'package'
  ) {
    return grouping;
  }
  return null;
}

function renderMatrixMarkdown(
  projectName: string,
  matrix: ReturnType<typeof buildMatrixView>,
): string {
  const lines: string[] = [];
  lines.push(`# Dependency matrix - ${projectName}`);
  lines.push('');
  lines.push(`Grouping: \`${matrix.grouping}\``);
  lines.push(
    `Modules: **${matrix.summary.modules}**, imports: **${matrix.summary.imports}**, groups: **${matrix.summary.groups}**, shown cells: **${matrix.summary.cells}**.`,
  );
  if (matrix.summary.violations > 0 || matrix.summary.cycleEdges > 0) {
    lines.push(
      `Risk edges: **${matrix.summary.violations}** violations, **${matrix.summary.cycleEdges}** cycle edges.`,
    );
  }
  lines.push('');
  lines.push('| From | To | Imports | Violations | Cycle edges |');
  lines.push('|---|---|---:|---:|---:|');
  for (const cell of matrix.cells.slice(0, 200)) {
    lines.push(
      `| \`${cell.from}\` | \`${cell.to}\` | ${cell.imports} | ${cell.violations} | ${cell.cycleEdges} |`,
    );
  }
  if (matrix.cells.length > 200) {
    lines.push(`| _and ${matrix.cells.length - 200} more_ |  |  |  |  |`);
  }
  const drilldown = matrix.cells
    .flatMap((cell) =>
      cell.edges.slice(0, 5).map((edge) => ({
        cell,
        edge,
      })),
    )
    .slice(0, 50);
  if (drilldown.length > 0) {
    lines.push('');
    lines.push('## Cell imports');
    lines.push('');
    lines.push('| Cell | Import | Kind | Signals |');
    lines.push('|---|---|---|---|');
    for (const item of drilldown) {
      lines.push(
        `| \`${item.cell.from}\` -> \`${item.cell.to}\` | \`${item.edge.from}\` -> \`${item.edge.to}\` | ${item.edge.kind} | ${edgeSignals(item.edge)} |`,
      );
    }
  }
  return lines.join('\n');
}

function edgeSignals(
  edge: ReturnType<typeof buildMatrixView>['cells'][number]['edges'][number],
): string {
  const signals: string[] = [];
  if (edge.violation) signals.push('violation');
  if (edge.cycleEdge) signals.push('cycle');
  return signals.length > 0 ? signals.join(', ') : 'normal';
}
