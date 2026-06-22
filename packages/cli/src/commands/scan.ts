import { analyze, buildFixPlan, type FixPlanFinding, type ScanResult } from '@archora/core';
import { analyzeWithCache } from '@archora/core/cache';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import {
  isFixtureOnly,
  isGeneratedOnly,
  reportCycles,
  reportHotZones,
  reportLayerViolations,
  reportStatus,
  reportStatusLabel,
  type ReportStatus,
} from '../exporters/reportView';
import { color, gradeColor } from '../lib/color';
import { loadCacheInputs } from '../lib/cacheInputs';
import { flagBool, type ParsedArgv } from '../argv';
import { resolveProjectPath } from './analyze';

/**
 * Zero-config first run. `archora` (no command) and `archora scan .` land here:
 * scan the working directory with no flags and no config, then print the few
 * things that matter — grade, headline counts, and a prioritized "fix this
 * first" list. The full machine output stays on `analyze`; this is the human
 * front door.
 */
export async function runScan(parsed: ParsedArgv): Promise<number> {
  const projectPath = resolveProjectPath(parsed);
  const cacheEnabled = flagBool(parsed, 'cache', true);

  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const start = Date.now();
  let scan: ScanResult;
  if (cacheEnabled) {
    const inputs = await loadCacheInputs(projectPath);
    const result = await analyzeWithCache(source, {
      rootPath: projectPath,
      toolVersion: inputs.toolVersion,
      ...(inputs.tsconfigText !== undefined ? { tsconfigText: inputs.tsconfigText } : {}),
      ...(inputs.packageDeps !== undefined ? { packageDeps: inputs.packageDeps } : {}),
      ...(inputs.frontScopeConfigText !== undefined
        ? { frontScopeConfigText: inputs.frontScopeConfigText }
        : {}),
    });
    scan = result.scan;
  } else {
    scan = await analyze(source);
  }
  const took = Date.now() - start;

  process.stdout.write(renderOverview(scan, took));
  return 0;
}

function renderOverview(scan: ScanResult, took: number): string {
  const lines: string[] = [];
  const name = scan.project.name || '.';

  if (scan.modules.length === 0) {
    lines.push('');
    lines.push(`${color.bold('Archora')} ${color.dim('·')} ${name}`);
    lines.push('');
    lines.push(color.yellow('  No source files found here.'));
    lines.push(
      color.dim('  Run Archora from your project root, or pass a path: archora scan ./app'),
    );
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  const grade = scan.archDebt.grade;
  const gc = gradeColor(grade);
  const status = reportStatus(scan);
  const cycles = reportCycles(scan);
  const layerViolations = reportLayerViolations(scan);
  const hotZones = reportHotZones(scan);

  lines.push('');
  lines.push(`${color.bold('Archora')} ${color.dim('·')} ${color.bold(name)}`);
  lines.push(
    `${gc(`Grade ${grade}`)} ${color.dim('·')} ${color.dim(`score ${scan.archDebt.score}/100`)} ${color.dim('·')} ${statusBadge(status)}`,
  );
  lines.push('');
  lines.push(`  ${metricLine(scan, cycles.length, layerViolations.length, hotZones.length)}`);
  lines.push('');

  const findings = topFindings(scan, 3);
  if (findings.length === 0) {
    lines.push(color.green('  ✓ Nothing urgent to fix. Architecture looks healthy.'));
    lines.push('');
  } else {
    lines.push(color.bold('Fix this first'));
    findings.forEach((f, i) => {
      lines.push(`  ${color.cyan(`${i + 1}.`)} ${f.title}`);
      lines.push(`     ${color.dim(f.reason)}`);
      lines.push(`     ${color.green('→')} ${f.action}`);
      if (i < findings.length - 1) lines.push('');
    });
    lines.push('');
  }

  lines.push(color.dim(`Full report  archora report . --format md -o report.md`));
  lines.push(color.dim(`Gate CI      archora check . --fail-on grade:D --fail-on cycles:0`));
  lines.push(color.dim(`All commands archora --help`));
  lines.push('');
  lines.push(color.dim(`scanned ${scan.modules.length} modules in ${took} ms`));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function statusBadge(status: ReportStatus): string {
  const label = reportStatusLabel(status);
  if (status === 'blocking') return color.red(label);
  if (status === 'review') return color.yellow(label);
  return color.green(label);
}

function metricLine(
  scan: ScanResult,
  cycles: number,
  layerViolations: number,
  hotZones: number,
): string {
  const sep = `  ${color.dim('·')}  `;
  const parts = [
    `${color.cyan(scan.modules.length)} modules`,
    `${color.cyan(scan.edges.length)} edges`,
    `${count(cycles)} ${plural(cycles, 'cycle')}`,
    `${count(layerViolations)} layer ${plural(layerViolations, 'violation')}`,
    `${count(hotZones)} hot ${plural(hotZones, 'zone')}`,
  ];
  return parts.join(sep);
}

/** Zero reads as calm (dim); any positive count reads as attention (yellow). */
function count(n: number): string {
  return n === 0 ? color.dim('0') : color.yellow(n);
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function topFindings(scan: ScanResult, limit: number): FixPlanFinding[] {
  const plan = buildFixPlan(scan);
  return plan.priorityFindings
    .filter((f) => !f.generated && !isFixtureOnly(f.targets) && !isGeneratedOnly(f.targets))
    .slice(0, limit);
}
