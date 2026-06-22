import { writeFile } from 'node:fs/promises';
import { buildReviewRiskView, diffScans, type ScanDiff, type ScanResult } from '@archora/core';
import { flagBool, flagString, flagStringList, type ParsedArgv } from '../argv';
import { readScanInput } from '../lib/readScanInput';
import { loadScan } from '../lib/loadScan';
import {
  reportHotspotAction,
  reportHotZones,
  reportReviewChecklist,
} from '../exporters/reportView';

type ReviewFormat = 'json' | 'md' | 'markdown';

export async function runReview(parsed: ParsedArgv): Promise<number> {
  const quiet = flagBool(parsed, 'quiet');
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  const format = (flagString(parsed, 'format') ?? 'md').toLowerCase() as ReviewFormat;
  const baselinePath = flagString(parsed, 'base') ?? flagString(parsed, 'baseline');
  const prComment = flagBool(parsed, 'pr-comment');
  const changedFiles = parseChangedFiles(flagStringList(parsed, 'changed-files'));

  if (format !== 'json' && format !== 'md' && format !== 'markdown') {
    process.stderr.write('error: --format must be json or md.\n');
    return 2;
  }

  const { scan } = await readScanInput(parsed, quiet);
  const baseline = baselinePath ? await loadScan(baselinePath) : null;
  const diff = baseline ? diffScans(baseline, scan) : null;
  const view = buildReviewRiskView(scan, { baseline, diff });
  const body =
    format === 'json'
      ? JSON.stringify(view, null, 2)
      : prComment
        ? renderPrCommentMarkdown(view, scan, buildChangedFileFocus(scan, diff, changedFiles))
        : renderReviewMarkdown(
            scan.project.name,
            view,
            scan,
            buildChangedFileFocus(scan, diff, changedFiles),
          );

  if (out) {
    await writeFile(out, body, 'utf-8');
    if (!quiet) console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }
  return 0;
}

interface ChangedFileFocus {
  files: string[];
  newCycles: number;
  violations: number;
  hotspots: number;
  areas: string[];
}

function renderPrCommentMarkdown(
  view: ReturnType<typeof buildReviewRiskView>,
  scan: ScanResult,
  changedFocus: ChangedFileFocus | null,
): string {
  const lines: string[] = [];
  lines.push('<!-- archora:review:start -->');
  lines.push('## Archora PR review');
  lines.push('');
  lines.push(`Risk: **${view.level}** (${view.score}/100). ${view.summary}`);
  lines.push('');
  lines.push('| Signal | Value |');
  lines.push('|---|---|');
  lines.push(`| Main reasons | ${view.reasons.join(', ') || 'none'} |`);
  lines.push(
    `| Affected areas | ${view.affectedAreas.map((area) => `\`${area}\``).join(', ') || 'none'} |`,
  );
  if (view.baseline) {
    lines.push(`| Changed modules | ${view.baseline.changedModules} |`);
    lines.push(`| New cycles | ${view.baseline.newCycles} |`);
    lines.push(`| New signals | ${view.baseline.newSignals} |`);
    lines.push(`| Regressed signals | ${view.baseline.regressedSignals} |`);
  }
  if (view.regressions.length > 0) {
    lines.push('');
    lines.push(`Regressions: ${view.regressions.slice(0, 4).join('; ')}.`);
  }
  appendChangedFileFocus(lines, changedFocus);
  if (view.guidedActions.length > 0) {
    lines.push('## Guided review');
    lines.push('');
    lines.push('| Step | Target | Action | Evidence | Verify |');
    lines.push('|---|---|---|---|---|');
    for (const item of view.guidedActions) {
      lines.push(
        `| ${item.title} | \`${item.target}\` | ${item.action} | ${item.evidence} | ${item.verify} |`,
      );
    }
    lines.push('');
  }
  if (view.checkFirst.length > 0) {
    lines.push('');
    lines.push('Review first:');
    for (const id of view.checkFirst.slice(0, 5)) {
      const hotspot = reportHotZones(scan).includes(id);
      if (hotspot) {
        const action = reportHotspotAction(scan, id);
        lines.push(`- ${action.summary}`);
        lines.push(`  - ${action.evidence}`);
      } else {
        lines.push(`- \`${id}\``);
      }
    }
  }
  lines.push('');
  lines.push('Full report: run `archora report . --format md --base <baseline>`.');
  lines.push('<!-- archora:review:end -->');
  return lines.join('\n');
}

function renderReviewMarkdown(
  projectName: string,
  view: ReturnType<typeof buildReviewRiskView>,
  scan: ScanResult,
  changedFocus: ChangedFileFocus | null = null,
): string {
  const lines: string[] = [];
  lines.push(`# Review risk - ${projectName}`);
  lines.push('');
  lines.push(`Risk: **${view.level}** (${view.score}/100).`);
  lines.push(view.summary);
  lines.push('');
  lines.push('| Item | Value |');
  lines.push('|---|---|');
  lines.push(
    `| Affected areas | ${view.affectedAreas.map((area) => `\`${area}\``).join(', ') || 'none'} |`,
  );
  lines.push(`| Main reasons | ${view.reasons.join(', ') || 'none'} |`);
  if (view.baseline) {
    lines.push(`| Added modules | ${view.baseline.addedModules} |`);
    lines.push(`| Changed modules | ${view.baseline.changedModules} |`);
    lines.push(`| New cycles | ${view.baseline.newCycles} |`);
    lines.push(`| Resolved cycles | ${view.baseline.resolvedCycles} |`);
    lines.push(`| New signals | ${view.baseline.newSignals} |`);
    lines.push(`| Regressed signals | ${view.baseline.regressedSignals} |`);
    lines.push(`| Resolved signals | ${view.baseline.resolvedSignals} |`);
  }
  lines.push('');
  if (view.regressions.length > 0) {
    lines.push('## What changed');
    lines.push('');
    for (const item of view.regressions) lines.push(`- ${item}`);
    lines.push('');
  }
  appendChangedFileFocus(lines, changedFocus);
  if (view.guidedActions.length > 0) {
    lines.push('## Guided review');
    lines.push('');
    lines.push('| Step | Target | Action | Evidence | Verify |');
    lines.push('|---|---|---|---|---|');
    for (const item of view.guidedActions) {
      lines.push(
        `| ${item.title} | \`${item.target}\` | ${item.action} | ${item.evidence} | ${item.verify} |`,
      );
    }
    lines.push('');
  }
  if (view.checkFirst.length > 0) {
    lines.push('## Check first');
    lines.push('');
    for (const id of view.checkFirst) lines.push(`- \`${id}\``);
    lines.push('');
  }
  const checklist = reportReviewChecklist(scan);
  if (checklist.length > 0) {
    lines.push('## Review checklist');
    lines.push('');
    for (const item of checklist) {
      lines.push(`- [ ] ${item.label}`);
      lines.push(`  - evidence: ${item.evidence}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function appendChangedFileFocus(lines: string[], focus: ChangedFileFocus | null): void {
  if (!focus) return;
  lines.push('');
  lines.push('## Changed-file focus');
  lines.push('');
  lines.push('| Item | Value |');
  lines.push('|---|---|');
  lines.push(`| Files | ${focus.files.map((file) => `\`${file}\``).join(', ')} |`);
  lines.push(`| New cycles | ${focus.newCycles} |`);
  lines.push(`| Violations | ${focus.violations} |`);
  lines.push(`| Hotspots | ${focus.hotspots} |`);
  lines.push(
    `| Affected areas/owners | ${focus.areas.map((area) => `\`${area}\``).join(', ') || 'none'} |`,
  );
  lines.push('');
}

function buildChangedFileFocus(
  scan: ScanResult,
  diff: ScanDiff | null,
  changedFiles: readonly string[],
): ChangedFileFocus | null {
  if (changedFiles.length === 0) return null;
  const files = changedFiles.map(normalizeModuleId);
  const changed = new Set(files);
  const touched = (modules: readonly string[]): boolean =>
    modules.some((module) => changed.has(normalizeModuleId(module)));

  const cycles = diff?.newCycles ?? scan.cycles;
  const touchedCycles = cycles.filter((cycle) => touched(cycle.modules));
  const touchedViolations = scan.layerViolations.filter((violation) =>
    touched([violation.from, violation.to]),
  );
  const touchedHotspots = scan.hotZones.filter((module) => changed.has(normalizeModuleId(module)));
  const areaInputs = [
    ...files,
    ...touchedCycles.flatMap((cycle) => cycle.modules),
    ...touchedViolations.flatMap((violation) => [violation.from, violation.to]),
    ...touchedHotspots,
  ];

  return {
    files,
    newCycles: touchedCycles.length,
    violations: touchedViolations.length,
    hotspots: touchedHotspots.length,
    areas: sortedUnique(areaInputs.map(areaOf)),
  };
}

function parseChangedFiles(values: readonly string[]): string[] {
  return sortedUnique(
    values
      .flatMap((value) => value.split(/[,\n]/u))
      .map(normalizeModuleId)
      .filter(Boolean),
  );
}

function normalizeModuleId(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//u, '');
}

function areaOf(id: string): string {
  const normalized = normalizeModuleId(id);
  const parts = normalized.split('/');
  if (parts[0] === 'src') {
    if (parts[1] === 'features' && parts[2]) return `features/${parts[2]}`;
    if (parts[1] === 'pages' && parts[2]) return `pages/${parts[2]}`;
    if (parts[1] === 'widgets' && parts[2]) return `widgets/${parts[2]}`;
    if (parts[1] === 'entities' && parts[2]) return `entities/${parts[2]}`;
    if (parts[1] === 'shared' && parts[2]) return `shared/${parts[2]}`;
    return parts[1] ?? 'src';
  }
  if (parts[0] === 'packages' && parts[1]) return `packages/${parts[1]}`;
  return parts[0] || 'project';
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
