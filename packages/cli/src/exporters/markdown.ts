import {
  buildSignalBaselineView,
  buildLifecycleHygieneView,
  buildReviewRiskView,
  canSignalFailCi,
  type ArchoraConfig,
  type ScanResult,
  type ScanDiff,
} from '@archora/core';
import { evaluateArchitectureBudget } from '../lib/architectureBudget';
import {
  hiddenFixtureFindingCount,
  hiddenGeneratedFindingCount,
  reportAffectedAreas,
  recommendationAction,
  recommendationTitle,
  reportCiSignals,
  reportContractViolations,
  reportCycles,
  reportHotZones,
  reportHotspotAction,
  reportLayerViolations,
  reportRecommendations,
  reportReviewChecklist,
  reportSignals,
  reportStatus,
  reportStatusLabel,
  signalReviewState,
} from './reportView';
import {
  memoryRiskEvidenceText,
  memoryRiskKindLabel,
  memoryRiskRemediationText,
  memoryRiskSource,
} from '../lib/memoryRiskText';
import {
  asyncLifecycleRiskEvidenceText,
  asyncLifecycleRiskKindLabel,
  asyncLifecycleRiskRemediationText,
  asyncLifecycleRiskSource,
} from '../lib/asyncLifecycleRiskText';

// Markdown report for PR comments. Lists are capped at 20 entries to fit
// under GitHub's comment-size limit for ~5000-module projects.
export function buildMarkdownReport(
  scan: ScanResult,
  diff: ScanDiff | null,
  baseline: ScanResult | null = null,
  config: ArchoraConfig = {},
): string {
  const lines: string[] = [];
  const project = scan.project;

  lines.push(`# Archora - ${project.name}`);
  lines.push('');
  lines.push(`Scanned ${scan.scannedAt} in ${scan.durationMs} ms.`);
  lines.push('');

  renderReviewBrief(lines, scan);
  renderGuidedReview(lines, scan);
  renderReviewChecklist(lines, scan);
  renderArchitectureBudget(lines, scan, diff, baseline, config);
  renderAffectedAreas(lines, scan);

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| Modules | ${scan.modules.length} |`);
  lines.push(`| Edges | ${scan.edges.length} |`);
  lines.push(`| Cycles | ${scan.cycles.length} |`);
  lines.push(`| Hot zones | ${scan.hotZones.length} |`);
  lines.push(`| Layer violations | ${scan.layerViolations.length} |`);
  lines.push(`| Contract violations | ${scan.contractViolations.length} |`);
  lines.push(`| Rules config | ${rulesConfigLabel(scan)} |`);
  lines.push(`| Signals | ${scan.signals?.length ?? 0} |`);
  lines.push(`| Recommendations | ${scan.recommendations.length} |`);
  lines.push(`| Architecture grade | **${scan.archDebt.grade}** (${scan.archDebt.score}/100) |`);
  const generatedCount = scan.modules.reduce((n, m) => n + (m.isGenerated ? 1 : 0), 0);
  if (generatedCount > 0) {
    lines.push(`| Generated modules | ${generatedCount} (de-prioritised) |`);
  }
  const hiddenFixtures = hiddenFixtureFindingCount(scan);
  if (hiddenFixtures > 0) {
    lines.push(`| Hidden fixture-only findings | ${hiddenFixtures} |`);
  }
  const hiddenGenerated = hiddenGeneratedFindingCount(scan);
  if (hiddenGenerated > 0) {
    lines.push(`| Hidden generated-only findings | ${hiddenGenerated} |`);
  }
  lines.push('');

  if (diff) {
    lines.push('## Changes vs. baseline');
    lines.push('');
    lines.push('| Change | Count |');
    lines.push('|---|---:|');
    lines.push(`| Added modules | ${diff.summary.addedModules} |`);
    lines.push(`| Removed modules | ${diff.summary.removedModules} |`);
    lines.push(`| Changed modules | ${diff.summary.changedModules} |`);
    lines.push(`| New cycles | ${diff.summary.newCycles} |`);
    lines.push(`| Resolved cycles | ${diff.summary.resolvedCycles} |`);
    lines.push('');
    renderWorseSinceBaseline(lines, scan, diff);
    renderRegressionDrivers(lines, diff);
    renderSignalBaseline(lines, scan, baseline);
    if (diff.newCycles.length > 0) {
      lines.push('### New cycles');
      lines.push('');
      for (const c of diff.newCycles.slice(0, 20)) {
        lines.push(`- **${c.severity}** ${c.modules.join(' → ')}`);
      }
      if (diff.newCycles.length > 20) {
        lines.push(`- _… and ${diff.newCycles.length - 20} more_`);
      }
      lines.push('');
    }
  }

  renderConfigDiagnostics(lines, scan);
  renderRiskBuckets(lines, scan);
  renderActionableSignals(lines, scan);
  renderLifecycleHygiene(lines, scan);
  renderMemoryRisks(lines, scan);
  renderAsyncLifecycleRisks(lines, scan);
  renderRuleViolations(lines, scan);

  const recommendations = reportRecommendations(scan);
  if (recommendations.length > 0) {
    lines.push('## Top recommendations');
    lines.push('');
    for (const r of recommendations.slice(0, 12)) {
      lines.push(`- **${recommendationTitle(r)}** (${r.kind}, weight ${r.weight.toFixed(2)})`);
      lines.push(`  - action: ${recommendationAction(r)}`);
      lines.push(
        `  - modules: ${r.modules.slice(0, 3).join(', ')}${r.modules.length > 3 ? '…' : ''}`,
      );
    }
    if (recommendations.length > 12) {
      lines.push(`- _… and ${recommendations.length - 12} more_`);
    }
    lines.push('');
  }

  const cycles = reportCycles(scan);
  if (cycles.length > 0) {
    lines.push('## Cycles');
    lines.push('');
    for (const c of cycles.slice(0, 10)) {
      lines.push(`- **${c.severity}** (${c.length} modules): ${c.modules.join(' → ')}`);
    }
    if (cycles.length > 10) {
      lines.push(`- _… and ${cycles.length - 10} more_`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderGuidedReview(lines: string[], scan: ScanResult): void {
  const actions = buildReviewRiskView(scan).guidedActions;
  if (actions.length === 0) return;
  lines.push('## Guided review');
  lines.push('');
  lines.push('| Step | Target | Action | Verify |');
  lines.push('|---|---|---|---|');
  for (const item of actions) {
    lines.push(`| ${item.title} | ${item.target} | ${item.action} | ${item.verify} |`);
  }
  lines.push('');
}

function renderArchitectureBudget(
  lines: string[],
  scan: ScanResult,
  diff: ScanDiff | null,
  baseline: ScanResult | null,
  config: ArchoraConfig,
): void {
  if (!config.architectureBudget) return;
  const result = evaluateArchitectureBudget(config, scan, { diff, baseline });
  lines.push('## Architecture budget');
  lines.push('');
  lines.push('| Item | Value |');
  lines.push('|---|---|');
  lines.push(`| Status | ${result.failed ? 'failed' : 'passed'} |`);
  if (result.reasons.length === 0) {
    lines.push('| Reason | all configured limits are within budget |');
  } else {
    for (const reason of result.reasons) {
      lines.push(
        `| ${reason.key} | ${reason.message}: ${reason.actual} > budget ${reason.limit} |`,
      );
    }
  }
  lines.push('');
}

function renderReviewChecklist(lines: string[], scan: ScanResult): void {
  const checklist = reportReviewChecklist(scan);
  lines.push('## Review checklist');
  lines.push('');
  if (checklist.length === 0) {
    lines.push(
      '- [ ] Keep the current baseline and watch for new cycles, rule errors and CI-safe signals.',
    );
    lines.push('');
    return;
  }
  for (const item of checklist) {
    lines.push(`- [ ] ${item.label}`);
    lines.push(`  - evidence: ${item.evidence}`);
  }
  lines.push('');
}

function renderRegressionDrivers(lines: string[], diff: ScanDiff): void {
  const rows: string[] = [];
  for (const cycle of diff.newCycles.slice(0, 5)) {
    rows.push(
      `| New ${cycle.severity} cycle | ${cycle.length} modules | ${cycle.modules.slice(0, 4).join(' → ')} |`,
    );
  }
  for (const change of diff.changedModules.slice(0, 5)) {
    const locDelta = change.next.loc - change.prev.loc;
    const kind =
      change.prev.kind === change.next.kind
        ? change.next.kind
        : `${change.prev.kind} -> ${change.next.kind}`;
    rows.push(`| Changed module | LOC ${formatDelta(locDelta)}, ${kind} | ${change.id} |`);
  }
  for (const module of diff.addedModules.slice(0, 5)) {
    rows.push(`| Added module | ${module.kind}, ${module.loc} LOC | ${module.id} |`);
  }
  if (rows.length === 0) return;
  lines.push('### Baseline regression drivers');
  lines.push('');
  lines.push('| Type | Impact | Evidence |');
  lines.push('|---|---|---|');
  lines.push(...rows);
  lines.push('');
}

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function renderSignalBaseline(
  lines: string[],
  scan: ScanResult,
  baseline: ScanResult | null,
): void {
  if (!baseline) return;
  const view = buildSignalBaselineView(baseline, scan);
  if (
    view.newSignals.length === 0 &&
    view.regressedSignals.length === 0 &&
    view.resolved.length === 0
  ) {
    return;
  }
  lines.push('### Signals vs. baseline');
  lines.push('');
  lines.push('| Status | Count | CI-safe high+ |');
  lines.push('|---|---:|---:|');
  lines.push(`| New | ${view.newSignals.length} | ${ciSafeHighCount(view.newSignals)} |`);
  lines.push(
    `| Regressed | ${view.regressedSignals.length} | ${ciSafeHighCount(view.regressedSignals)} |`,
  );
  lines.push(`| Resolved | ${view.resolved.length} | - |`);
  lines.push('');
  for (const signal of [...view.regressedSignals, ...view.newSignals].slice(0, 10)) {
    lines.push(`- **${signal.status}** \`${signal.severity}\` ${signal.title}`);
    if (signal.modules.length > 0)
      lines.push(`  - modules: ${signal.modules.slice(0, 3).join(', ')}`);
  }
  lines.push('');
}

function ciSafeHighCount(signals: readonly NonNullable<ScanResult['signals']>[number][]): number {
  return signals.filter((signal) => canSignalFailCi(signal, { minSeverity: 'high' })).length;
}

function renderReviewBrief(lines: string[], scan: ScanResult): void {
  const areas = reportAffectedAreas(scan);
  lines.push('## Review brief');
  lines.push('');
  lines.push('| Item | Value |');
  lines.push('|---|---|');
  lines.push(`| Status | **${reportStatusLabel(reportStatus(scan))}** |`);
  lines.push(`| Fix first | ${firstAction(scan)} |`);
  lines.push(
    `| Affected areas | ${
      areas
        .slice(0, 4)
        .map((area) => `\`${area.area}\``)
        .join(', ') || 'none'
    } |`,
  );
  lines.push(`| Rules config | ${rulesConfigLabel(scan)} |`);
  lines.push(`| CI gate suggestion | ${ciGateCandidate(scan)} |`);
  lines.push(`| Confidence | ${confidenceNote(scan)} |`);
  lines.push('');
}

function renderAffectedAreas(lines: string[], scan: ScanResult): void {
  const areas = reportAffectedAreas(scan).slice(0, 8);
  if (areas.length === 0) return;
  lines.push('## Affected areas');
  lines.push('');
  lines.push('| Area | Modules | Findings | Risk |');
  lines.push('|---|---:|---:|---:|');
  for (const area of areas) {
    lines.push(
      `| \`${area.area}\` | ${area.modules} | ${area.findings} | ${area.riskScore.toFixed(1)} |`,
    );
  }
  lines.push('');
}

function renderWorseSinceBaseline(lines: string[], scan: ScanResult, diff: ScanDiff): void {
  const items: string[] = [];
  if (diff.summary.newCycles > 0) items.push(`${diff.summary.newCycles} new cycle(s)`);
  if (scan.archDebt.grade === 'D' || scan.archDebt.grade === 'F') {
    items.push(`architecture grade is ${scan.archDebt.grade}`);
  }
  const highSignals = (scan.signals ?? []).filter(
    (signal) => signal.severity === 'high' || signal.severity === 'critical',
  ).length;
  if (highSignals > 0) items.push(`${highSignals} high/critical signal(s)`);
  if (items.length === 0) return;

  lines.push('### What got worse');
  lines.push('');
  for (const item of items) lines.push(`- ${item}`);
  lines.push('');
}

function renderConfigDiagnostics(lines: string[], scan: ScanResult): void {
  const diagnostics = scan.configDiagnostics ?? [];
  if (diagnostics.length === 0) return;
  lines.push('## Rules config diagnostics');
  lines.push('');
  for (const diagnostic of diagnostics.slice(0, 20)) {
    lines.push(
      `- **${diagnostic.severity}** \`${diagnostic.file}${diagnostic.path}\`: ${diagnostic.message}`,
    );
  }
  if (diagnostics.length > 20) lines.push(`- _… and ${diagnostics.length - 20} more_`);
  lines.push('');
}

function renderRiskBuckets(lines: string[], scan: ScanResult): void {
  const layer = reportLayerViolations(scan);
  const contracts = reportContractViolations(scan);
  const cycles = reportCycles(scan);
  const hotZones = reportHotZones(scan);
  const high = [
    ...contracts.filter((violation) => violation.severity === 'error'),
    ...layer.filter((violation) => violation.severity === 'error'),
  ].length;
  const medium =
    cycles.length +
    layer.filter((violation) => violation.severity === 'warning').length +
    contracts.filter((violation) => violation.severity === 'warning').length;
  const low = hotZones.length;

  lines.push('## Risk buckets');
  lines.push('');
  lines.push('| Bucket | Count | What it means |');
  lines.push('|---|---:|---|');
  lines.push(`| High | ${high} | Contract or layer errors that can block CI. |`);
  lines.push(`| Medium | ${medium} | Cycles and warning-level architecture issues. |`);
  lines.push(`| Low | ${low} | Hotspots to review after blocking issues. |`);
  lines.push('');
}

function renderActionableSignals(lines: string[], scan: ScanResult): void {
  const ciSignals = reportCiSignals(scan);
  const signals = reportSignals(scan);
  if (ciSignals.length === 0 && signals.length === 0) return;

  lines.push('## Signal review');
  lines.push('');
  lines.push(`CI-safe high+ signals: **${ciSignals.length}**.`);
  const lowerConfidence = signals.filter((signal) => signal.confidence !== 'high').length;
  if (lowerConfidence > 0) {
    lines.push(`Lower-confidence signals kept out of CI gates: ${lowerConfidence}.`);
  }
  lines.push('');
  lines.push('| Severity | Confidence | State | Signal | Modules | Evidence |');
  lines.push('|---|---|---|---|---|---|');
  for (const signal of signals.slice(0, 10)) {
    const modules = signal.modules.slice(0, 3).join(', ') || '-';
    const evidence = signal.evidence[0]?.message ?? '-';
    lines.push(
      `| ${signal.severity} | ${signal.confidence} | ${signalReviewState(signal)} | ${signal.title} | ${modules} | ${evidence} |`,
    );
  }
  if (signals.length > 10) lines.push(`| _… and ${signals.length - 10} more_ | | | | | |`);
  lines.push('');
}

function renderMemoryRisks(lines: string[], scan: ScanResult): void {
  const risks = scan.memoryRisks ?? [];
  if (risks.length === 0) return;

  lines.push('## Memory risk');
  lines.push('');
  lines.push('static risk, not runtime proof.');
  lines.push('');
  lines.push('| Kind | Confidence | Module | Evidence | Remediation |');
  lines.push('|---|---|---|---|---|');
  for (const risk of risks.slice(0, 10)) {
    lines.push(
      `| ${memoryRiskKindLabel(risk.kind)} | ${risk.confidence} | ${memoryRiskSource(risk)} | ${memoryRiskEvidenceText(risk)} | ${memoryRiskRemediationText(risk)} |`,
    );
  }
  if (risks.length > 10) lines.push(`| _… and ${risks.length - 10} more_ | | | | |`);
  lines.push('');
}

function renderLifecycleHygiene(lines: string[], scan: ScanResult): void {
  const view = buildLifecycleHygieneView(scan);
  if (view.summary.memoryRisks === 0 && view.summary.asyncLifecycleRisks === 0) return;

  lines.push('## Lifecycle hygiene');
  lines.push('');
  lines.push('| Area | Count |');
  lines.push('|---|---:|');
  lines.push(`| Memory risks | ${view.summary.memoryRisks} |`);
  lines.push(`| Async lifecycle risks | ${view.summary.asyncLifecycleRisks} |`);
  lines.push(`| Lifecycle risk modules | ${view.summary.lifecycleRiskModules} |`);
  lines.push(`| Side-effect owners | ${view.summary.sideEffectOwners} |`);
  lines.push('');
  if (view.sideEffectOwners.length > 0) {
    lines.push('## Side-effect ownership');
    lines.push('');
    lines.push('| Module | Owner | Layer | Role | Placement | Memory | Async lifecycle |');
    lines.push('|---|---|---|---|---|---:|---:|');
    for (const item of view.sideEffectOwners.slice(0, 10)) {
      lines.push(
        `| \`${item.id}\` | ${item.owner} | ${item.layer} | ${item.kind} | ${item.placement} | ${item.memoryRisks} | ${item.asyncLifecycleRisks} |`,
      );
    }
    if (view.sideEffectOwners.length > 10) {
      lines.push(`| _… and ${view.sideEffectOwners.length - 10} more_ | | | | | | |`);
    }
    lines.push('');
  }
  if (view.lifecycleRiskModules.length === 0) return;
  lines.push('| Module | Memory | Async lifecycle | Confidence | Severity |');
  lines.push('|---|---:|---:|---|---|');
  for (const item of view.lifecycleRiskModules.slice(0, 10)) {
    lines.push(
      `| ${item.id} | ${item.memoryRisks} | ${item.asyncLifecycleRisks} | ${item.confidence} | ${item.severity} |`,
    );
  }
  if (view.lifecycleRiskModules.length > 10) {
    lines.push(`| _… and ${view.lifecycleRiskModules.length - 10} more_ | | | | |`);
  }
  lines.push('');
}

function renderAsyncLifecycleRisks(lines: string[], scan: ScanResult): void {
  const risks = scan.asyncLifecycleRisks ?? [];
  if (risks.length === 0) return;

  lines.push('## Async lifecycle risk');
  lines.push('');
  lines.push('static async lifecycle risk, not runtime proof.');
  lines.push('');
  lines.push('| Kind | Confidence | Module | Evidence | Remediation |');
  lines.push('|---|---|---|---|---|');
  for (const risk of risks.slice(0, 10)) {
    lines.push(
      `| ${asyncLifecycleRiskKindLabel(risk.kind)} | ${risk.confidence} | ${asyncLifecycleRiskSource(risk)} | ${asyncLifecycleRiskEvidenceText(risk)} | ${asyncLifecycleRiskRemediationText(risk)} |`,
    );
  }
  if (risks.length > 10) lines.push(`| _… and ${risks.length - 10} more_ | | | | |`);
  lines.push('');
}

function renderRuleViolations(lines: string[], scan: ScanResult): void {
  const contracts = reportContractViolations(scan);
  const layer = reportLayerViolations(scan);
  if (contracts.length === 0 && layer.length === 0) return;

  lines.push('## Rule violations');
  lines.push('');
  if (contracts.length > 0) {
    lines.push('### Contracts');
    lines.push('');
    for (const violation of contracts.slice(0, 12)) {
      lines.push(`- **${violation.severity}** \`${violation.ruleName}\`: ${violation.message}`);
      if (violation.edge) {
        lines.push(`  - edge: ${violation.edge.from} -> ${violation.edge.to}`);
      } else if (violation.modules.length > 0) {
        lines.push(`  - modules: ${violation.modules.slice(0, 3).join(', ')}`);
      }
    }
    if (contracts.length > 12) lines.push(`- _… and ${contracts.length - 12} more_`);
    lines.push('');
  }
  if (layer.length > 0) {
    lines.push('### Layers');
    lines.push('');
    for (const violation of layer.slice(0, 12)) {
      lines.push(
        `- **${violation.severity}** ${violation.fromLayer} -> ${violation.toLayer}: ${violation.from} -> ${violation.to}`,
      );
    }
    if (layer.length > 12) lines.push(`- _… and ${layer.length - 12} more_`);
    lines.push('');
  }
}

function firstAction(scan: ScanResult): string {
  if ((scan.configDiagnostics?.length ?? 0) > 0) return 'fix rules config diagnostics';
  const contractError = reportContractViolations(scan).find(
    (violation) => violation.severity === 'error',
  );
  if (contractError) return `resolve contract \`${contractError.ruleName}\``;
  const directCycle = reportCycles(scan).find((cycle) => cycle.severity === 'direct');
  if (directCycle) return `break cycle \`${directCycle.id}\``;
  const hotspot = reportHotZones(scan)[0];
  if (hotspot) return reportHotspotAction(scan, hotspot).summary;
  return 'keep the current baseline and watch for regressions';
}

function rulesConfigLabel(scan: ScanResult): string {
  const diagnostics = scan.configDiagnostics ?? [];
  if (diagnostics.length > 0) return `invalid (${diagnostics.length} diagnostics)`;
  if (scan.configStatus?.state === 'loaded') {
    return `loaded (${scan.configStatus.file ?? 'config'})`;
  }
  return 'not configured';
}

function ciGateCandidate(scan: ScanResult): string {
  if (reportContractViolations(scan).length > 0) return '`contract-errors:0`';
  if (reportCycles(scan).length > 0) return '`new-cycles:0` with a baseline';
  if (reportCiSignals(scan).length > 0) return '`new-signals:high` with a baseline';
  return '`grade:D`';
}

function confidenceNote(scan: ScanResult): string {
  const ciSignals = reportCiSignals(scan).length;
  const uncertain = reportSignals(scan).filter((signal) => signal.confidence !== 'high').length;
  if (ciSignals > 0) return `${ciSignals} CI-safe high-confidence signal(s)`;
  if (uncertain > 0) return `${uncertain} lower-confidence signal(s) kept out of CI gates`;
  if (scan.warnings.length > 0) return `${scan.warnings.length} analyzer warning(s) need review`;
  return 'all emitted signals are high confidence or no signals were emitted';
}
