import type { ModuleId, ModuleNode, Recommendation, ScanResult } from '../analyzer/types';
import { buildDeadCodeReport, isReviewModule, unreachableRepair } from './buildDeadCodeReport';

export interface FixPlanFinding {
  type:
    | 'cycle'
    | 'barrel-cycle'
    | 'move-module'
    | 'unreachable-from-entries'
    | 'layer-violation'
    | 'contract-violation'
    | 'hot-zone'
    | 'recommendation';
  id: string;
  title: string;
  weight: number;
  targets: ModuleId[];
  reason: string;
  action: string;
  verify: string;
  /** True when every target module is marked `isGenerated`. */
  generated?: boolean;
  params?: Record<string, unknown>;
}

export interface FixPlanReport {
  kind: 'archora-fix-plan';
  version: 1;
  exportedAt: string;
  appVersion: string;
  project: ScanResult['project'];
  scannedAt: string;
  architectureDebt: ScanResult['archDebt'];
  summary: {
    cycles: number;
    layerViolations: number;
    contractViolations: number;
    hotZones: number;
    generatedModules: number;
  };
  priorityFindings: FixPlanFinding[];
  repairGroups: FixPlanRepairGroup[];
  evidence: {
    cycles: ScanResult['cycles'];
    layerViolations: ScanResult['layerViolations'];
    contractViolations: ScanResult['contractViolations'];
    hotZones: ScanResult['hotZones'];
    generatedModules: ModuleId[];
  };
  verificationOrder: string[];
}

export interface FixPlanRepairGroup {
  id: 'safe-first' | 'high-impact' | 'review-before-change';
  title: string;
  description: string;
  findings: string[];
}

export interface BuildFixPlanOptions {
  appVersion?: string;
  exportedAt?: string;
}

export function buildFixPlan(scan: ScanResult, options: BuildFixPlanOptions = {}): FixPlanReport {
  const generated = collectGenerated(scan.modules);
  const priorityFindings = buildPriorityFindings(scan, generated);
  return {
    kind: 'archora-fix-plan',
    version: 1,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    appVersion: options.appVersion ?? 'archora',
    project: scan.project,
    scannedAt: scan.scannedAt,
    architectureDebt: scan.archDebt,
    summary: {
      cycles: scan.cycles.length,
      layerViolations: scan.layerViolations.length,
      contractViolations: scan.contractViolations.length,
      hotZones: scan.hotZones.length,
      generatedModules: generated.size,
    },
    priorityFindings,
    repairGroups: buildRepairGroups(priorityFindings),
    evidence: {
      cycles: scan.cycles.slice(0, 20),
      layerViolations: scan.layerViolations.slice(0, 50),
      contractViolations: scan.contractViolations.slice(0, 50),
      hotZones: scan.hotZones.slice(0, 50),
      generatedModules: [...generated].slice(0, 100),
    },
    verificationOrder: buildVerificationOrder(scan),
  };
}

function buildRepairGroups(findings: readonly FixPlanFinding[]): FixPlanRepairGroup[] {
  const safeFirst = findings
    .filter((finding) => ['unreachable-from-entries', 'barrel-cycle'].includes(finding.type))
    .slice(0, 8)
    .map((finding) => finding.id);
  const highImpact = findings
    .filter((finding) => finding.weight >= 80 && !finding.generated)
    .slice(0, 8)
    .map((finding) => finding.id);
  const reviewBeforeChange = findings
    .filter((finding) =>
      ['cycle', 'layer-violation', 'contract-violation', 'hot-zone'].includes(finding.type),
    )
    .slice(0, 8)
    .map((finding) => finding.id);

  return [
    {
      id: 'safe-first',
      title: 'Safe first',
      description: 'Small repair candidates with concrete targets and low blast radius.',
      findings: safeFirst,
    },
    {
      id: 'high-impact',
      title: 'High impact',
      description: 'Highest-weight user-code findings to review before release or broad refactor.',
      findings: highImpact,
    },
    {
      id: 'review-before-change',
      title: 'Review before change',
      description: 'Findings that need Impact, Rules or Cycles evidence before editing code.',
      findings: reviewBeforeChange,
    },
  ];
}

function collectGenerated(modules: readonly ModuleNode[]): Set<ModuleId> {
  const set = new Set<ModuleId>();
  for (const m of modules) if (m.isGenerated || isLikelyGeneratedPath(m.id)) set.add(m.id);
  return set;
}

// Generated-only findings are evidence, not the first repair target.
const GENERATED_WEIGHT_MULTIPLIER = 0.1;

function buildPriorityFindings(scan: ScanResult, generated: Set<ModuleId>): FixPlanFinding[] {
  const findings: FixPlanFinding[] = [];
  const tagAndDownweight = (f: FixPlanFinding): FixPlanFinding => {
    if (f.targets.length === 0) return f;
    const allGenerated = f.targets.every((id) => generated.has(id));
    if (!allGenerated) return f;
    return { ...f, generated: true, weight: f.weight * GENERATED_WEIGHT_MULTIPLIER };
  };

  for (const cycle of scan.cycles.slice(0, 20)) {
    if (!cycle.modules.some(isReviewModule)) continue;
    const bp = cycle.suggestedBreakpoint;
    const breakLabel = bp
      ? `${bp.from} -> ${bp.to}`
      : cycle.modules[0] && cycle.modules[1]
        ? `${cycle.modules[0]} -> ${cycle.modules[1]}`
        : cycle.id;
    findings.push({
      type: 'cycle',
      id: cycle.id,
      title: cycle.severity === 'direct' ? 'Direct dependency cycle' : 'Indirect dependency cycle',
      weight: cycle.severity === 'direct' ? 100 : 82,
      targets: cycle.modules,
      reason: `${cycle.length} modules close a dependency cycle.`,
      action: `Break the import from ${breakLabel}.`,
      verify: 'Open Cycles and confirm this cycle disappeared or reduced after re-scan.',
      params: { severity: cycle.severity, suggestedBreakpoint: bp ?? breakLabel },
    });

    const barrel = cycle.modules.find((id) => /(^|\/)index\.[cm]?[jt]sx?$/u.test(id));
    if (barrel) {
      const repair = barrelCycleRepair(scan, cycle.modules, barrel);
      findings.push({
        type: 'barrel-cycle',
        id: `${cycle.id}:barrel`,
        title: 'Barrel cycle candidate',
        weight: cycle.severity === 'direct' ? 92 : 74,
        targets: cycle.modules,
        reason: `${barrel} participates in a dependency cycle and may be re-exporting back into its consumers.`,
        action: repair.action,
        verify: repair.verify,
        params: { cycleId: cycle.id, barrel, ...repair.params },
      });
    }
  }

  for (const violation of scan.layerViolations.slice(0, 50)) {
    if (!isReviewModule(violation.from) || !isReviewModule(violation.to)) continue;
    findings.push({
      type: 'layer-violation',
      id: violation.edgeId,
      title: `${violation.fromLayer} imports ${violation.toLayer}`,
      weight: violation.severity === 'error' ? 88 : 66,
      targets: [violation.from, violation.to],
      reason: 'Import direction crosses a configured or inferred layer boundary.',
      action:
        'Move the dependency to an allowed layer, introduce an adapter, or make the policy explicit.',
      verify: 'Open Rules and confirm the violated boundary is no longer present after re-scan.',
      params: {
        severity: violation.severity,
        fromLayer: violation.fromLayer,
        toLayer: violation.toLayer,
      },
    });
    const moveRepair = layerViolationMoveRepair(violation);
    findings.push({
      type: 'move-module',
      id: `${violation.edgeId}:move`,
      title: `Move boundary for ${violation.fromLayer} -> ${violation.toLayer}`,
      weight: violation.severity === 'error' ? 84 : 58,
      targets: [violation.from, violation.to],
      reason: 'This import crosses a layer boundary and has a deterministic source/target pair.',
      action: moveRepair.action,
      verify: moveRepair.verify,
      params: {
        severity: violation.severity,
        from: violation.from,
        to: violation.to,
        fromLayer: violation.fromLayer,
        toLayer: violation.toLayer,
      },
    });
  }

  for (const candidate of buildDeadCodeReport(scan).candidates) {
    const repair = unreachableRepair(candidate.id);
    findings.push({
      type: 'unreachable-from-entries',
      id: `${candidate.id}:unreachable`,
      title: 'Unreachable module candidate',
      weight: Math.min(70, 35 + candidate.loc / 10),
      targets: [candidate.id],
      reason: candidate.reason,
      action: repair.action,
      verify: repair.verify,
      params: { loc: candidate.loc, ...repair.params },
    });
  }

  for (const violation of scan.contractViolations.slice(0, 50)) {
    if (!violation.modules.some(isReviewModule)) continue;
    const repair = contractViolationRepair(violation);
    findings.push({
      type: 'contract-violation',
      id: violation.id,
      title: violation.ruleName,
      weight: violation.severity === 'error' ? 86 : 64,
      targets: violation.modules,
      reason: violation.message,
      action: repair.action,
      verify: repair.verify,
      params: { severity: violation.severity },
    });
  }

  for (const id of scan.hotZones.slice(0, 50)) {
    if (!isReviewModule(id)) continue;
    const metrics = scan.metrics[id];
    const churn = scan.churn?.[id];
    const repair = hotspotRepair(id, metrics, churn);
    const finding: FixPlanFinding = {
      type: 'hot-zone',
      id,
      title: 'High change-risk module',
      weight: metrics ? Math.min(80, metrics.hotnessScore * 10) : 40,
      targets: [id],
      reason: hotspotReason(metrics, churn),
      action: repair.action,
      verify: repair.verify,
    };
    if (metrics) {
      finding.params = { fanIn: metrics.fanIn, fanOut: metrics.fanOut, inCycle: metrics.inCycle };
    }
    if (churn) {
      finding.params = {
        ...finding.params,
        commits: churn.commits,
        authorCount: churn.authorCount,
        linesChanged: churn.linesChanged,
      };
    }
    findings.push(finding);
  }

  for (const item of scan.recommendations) {
    if (!item.modules.some(isReviewModule)) continue;
    findings.push({
      type: 'recommendation',
      id: item.id,
      title: item.kind,
      weight: item.weight,
      targets: item.modules,
      reason: 'Analyzer recommendation derived from structural findings.',
      action: 'Review the recommendation in Archora before applying the change.',
      verify: 'Re-scan the project and compare the priority queue.',
      params: recommendationParams(item),
    });
  }

  return findings
    .map(tagAndDownweight)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 100);
}

function isLikelyGeneratedPath(id: ModuleId): boolean {
  return /(^|\/)(generated|__generated__|openapi|swagger|graphql-codegen)(\/|$)/iu.test(id);
}

function barrelCycleRepair(
  scan: ScanResult,
  modules: readonly ModuleId[],
  barrel: ModuleId,
): { action: string; verify: string; params: Record<string, unknown> } {
  const inCycle = new Set(modules);
  const importer = scan.edges.find(
    (edge) =>
      edge.kind !== 'type-only' &&
      edge.to === barrel &&
      edge.from !== barrel &&
      inCycle.has(edge.from),
  );

  if (!importer) {
    return {
      action:
        'Split the barrel export or import the concrete module directly at the suggested cycle boundary.',
      verify:
        'Open Cycles and confirm the cycle no longer contains this barrel module after re-scan.',
      params: {},
    };
  }

  return {
    action: `Replace imports through ${barrel} in ${importer.from} with concrete module paths, then keep ${barrel} as export-only.`,
    verify: `Run archora check . --fail-on new-cycles:0 and confirm ${barrel} no longer participates in this cycle.`,
    params: {
      importer: importer.from,
      importSpecifier: importer.specifier,
    },
  };
}

function layerViolationMoveRepair(violation: ScanResult['layerViolations'][number]): {
  action: string;
  verify: string;
} {
  return {
    action: `Remove the forbidden import ${violation.from} -> ${violation.to}. Move the dependency behind a ${violation.fromLayer}-facing adapter or invert the dependency through an allowed ${violation.toLayer} entry.`,
    verify:
      'Run archora check . --fail-on layer-violations:0 and confirm the boundary no longer appears in Rules.',
  };
}

function hotspotRepair(
  id: ModuleId,
  metrics: ScanResult['metrics'][ModuleId] | undefined,
  churn: NonNullable<ScanResult['churn']>[ModuleId] | undefined,
): { action: string; verify: string } {
  const churnPrefix =
    churn && churn.commits >= 5
      ? `Coordinate the change with recent owners first: ${id} changed ${churn.commits} times across ${churn.authorCount} author(s). `
      : '';

  if (!metrics) {
    return {
      action: `${churnPrefix}Inspect Impact before changing this module and keep the public surface stable.`,
      verify: `Run archora impact --module ${id} and focused tests around affected consumers.`,
    };
  }

  if (metrics.fanIn >= metrics.fanOut) {
    return {
      action: `${churnPrefix}Freeze the public surface of ${id} first, then inspect its ${metrics.fanIn} consumers before editing internals.`,
      verify: `Run archora impact --module ${id} and focused tests around affected consumers.`,
    };
  }

  return {
    action: `${churnPrefix}Reduce outgoing dependencies from ${id} first, then split stable behavior away from volatile integrations.`,
    verify: `Run archora impact --module ${id} and confirm outbound impact is smaller after re-scan.`,
  };
}

function hotspotReason(
  metrics: ScanResult['metrics'][ModuleId] | undefined,
  churn: NonNullable<ScanResult['churn']>[ModuleId] | undefined,
): string {
  const structural = metrics
    ? `${metrics.fanIn} incoming and ${metrics.fanOut} outgoing dependencies.`
    : 'Module was ranked as a hotspot by the analyzer.';
  if (!churn) return structural;
  return `${structural} Git history: ${churn.commits} commits, ${churn.linesChanged} changed lines, ${churn.authorCount} author(s).`;
}

function contractViolationRepair(violation: ScanResult['contractViolations'][number]): {
  action: string;
  verify: string;
} {
  const target = violation.modules.find(isReviewModule) ?? violation.modules[0] ?? violation.id;
  const fallback =
    violation.severity === 'error'
      ? 'archora check . --fail-on contract-errors:0'
      : 'archora check . --fail-on contract-violations:0';

  return {
    action: `Fix ${violation.ruleName} in ${target}: narrow the exported surface or add an explicit policy exception with owner approval.`,
    verify: `Run ${fallback} and confirm the contract violation is removed or intentionally suppressed.`,
  };
}

function recommendationParams(item: Recommendation): Record<string, unknown> {
  return item.params as Record<string, unknown>;
}

function buildVerificationOrder(scan: ScanResult): string[] {
  const steps: string[] = [];
  if (scan.cycles.length > 0) steps.push('Verify cycle breakpoints first');
  if (scan.layerViolations.length > 0) steps.push('Verify layer boundary fixes');
  if (scan.contractViolations.length > 0) steps.push('Verify contract exceptions or fixes');
  if (scan.hotZones.length > 0) steps.push('Run focused smoke tests around hot zones');
  if (steps.length === 0) steps.push('Run project test suite after changes');
  return steps;
}
