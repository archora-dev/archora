import { canSignalFailCi, reconcileSignalLifecycle } from '../analyzer/signals';
import type {
  ArchitectureSignal,
  Cycle,
  LayerViolation,
  ModuleId,
  ScanResult,
  SignalSeverity,
} from '../analyzer/types';
import { detectLayer } from '../analyzer/layers';
import { diffScans } from '../diff';
import type { ScanDiff } from '../diff/types';
import { isReviewModule } from '../report/buildDeadCodeReport';

export type MatrixGrouping = 'area' | 'layer' | 'folder' | 'package';

export interface BuildMatrixViewOptions {
  groupBy?: MatrixGrouping;
  onlyViolations?: boolean;
  onlyCycles?: boolean;
  top?: number;
}

export interface MatrixCell {
  from: string;
  to: string;
  imports: number;
  violations: number;
  cycleEdges: number;
  edges: MatrixEdge[];
}

export interface MatrixEdge {
  from: ModuleId;
  to: ModuleId;
  kind: ScanResult['edges'][number]['kind'];
  specifier: string;
  violation: boolean;
  cycleEdge: boolean;
}

export interface MatrixView {
  grouping: MatrixGrouping;
  groups: string[];
  cells: MatrixCell[];
  summary: {
    modules: number;
    imports: number;
    groups: number;
    cells: number;
    violations: number;
    cycleEdges: number;
  };
}

export interface ImpactView {
  target: ModuleId;
  imports: ModuleId[];
  importers: ModuleId[];
  affectedModules: ModuleId[];
  affectedAreas: string[];
  affectedFolders: string[];
  cyclesTouched: string[];
  violationsTouched: number;
  relatedSignals: string[];
  metrics: {
    fanIn: number;
    fanOut: number;
    instability: number;
    hotnessScore: number;
  };
  risk: 'low' | 'medium' | 'high';
}

export interface ExplainView {
  kind: 'signal' | 'cycle' | 'module' | 'project';
  title: string;
  severity?: string;
  confidence?: string;
  evidence: string[];
  modules: ModuleId[];
  nextSteps: string[];
  cycle?: ExplainCycleDetails;
}

export interface ExplainCycleDetails {
  affectedAreas: string[];
  affectedFolders: string[];
  affectedLayers: string[];
  edges: ExplainCycleEdge[];
  suggestedBreakpoint: { from: ModuleId; to: ModuleId; reason: string } | null;
}

export interface ExplainCycleEdge {
  from: ModuleId;
  to: ModuleId;
  kind: ScanResult['edges'][number]['kind'];
  specifier: string;
  fromLayer: string;
  toLayer: string;
  fromFolder: string;
  toFolder: string;
  crossesLayer: boolean;
  violatesBoundary: boolean;
}

export interface SignalBaselineView {
  current: ArchitectureSignal[];
  resolved: ArchitectureSignal[];
  newSignals: ArchitectureSignal[];
  regressedSignals: ArchitectureSignal[];
}

export interface ReviewRiskView {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  reasons: string[];
  guidedActions: GuidedReviewAction[];
  checkFirst: ModuleId[];
  affectedAreas: string[];
  baseline?: {
    addedModules: number;
    changedModules: number;
    removedModules: number;
    newCycles: number;
    resolvedCycles: number;
    newSignals: number;
    regressedSignals: number;
    resolvedSignals: number;
  };
  regressions: string[];
}

export interface GuidedReviewAction {
  kind: 'cycle' | 'rule' | 'contract' | 'signal' | 'hotspot' | 'lifecycle';
  title: string;
  target: ModuleId;
  action: string;
  evidence: string;
  verify: string;
}

export interface OwnershipArea {
  area: string;
  modules: number;
  findings: number;
  riskScore: number;
  primaryKind: ScanResult['modules'][number]['kind'];
  ownerHint: string;
}

export interface OwnershipView {
  areas: OwnershipArea[];
  drift: OwnershipArea[];
  unownedHotspots: ModuleId[];
}

export interface SemanticSurfaceModule {
  id: ModuleId;
  exports: number;
  fanIn: number;
  fanOut: number;
  role: ScanResult['modules'][number]['kind'];
  risk: number;
}

export interface SemanticSurfaceView {
  broadPublicModules: SemanticSurfaceModule[];
  quietExports: SemanticSurfaceModule[];
  typeClusters: SemanticSurfaceModule[];
}

export interface LifecycleHygieneItem {
  id: ModuleId;
  reason: 'detached' | 'entry-candidate' | 'generated-pressure';
  fanIn: number;
  fanOut: number;
  exports: number;
  loc: number;
  risk: number;
}

export interface LifecycleRiskModule {
  id: ModuleId;
  memoryRisks: number;
  asyncLifecycleRisks: number;
  totalRisks: number;
  confidence: 'low' | 'medium' | 'high';
  severity: 'low' | 'medium';
}

export interface SideEffectOwner {
  id: ModuleId;
  owner: string;
  layer: string;
  kind: ScanResult['modules'][number]['kind'];
  memoryRisks: number;
  asyncLifecycleRisks: number;
  totalRisks: number;
  placement: 'owned' | 'review';
}

export interface LifecycleHygieneView {
  summary: {
    removableCandidates: number;
    entryCandidates: number;
    generatedPressure: number;
    memoryRisks: number;
    asyncLifecycleRisks: number;
    lifecycleRiskModules: number;
    sideEffectOwners: number;
  };
  removableCandidates: LifecycleHygieneItem[];
  entryCandidates: LifecycleHygieneItem[];
  generatedPressure: LifecycleHygieneItem[];
  lifecycleRiskModules: LifecycleRiskModule[];
  sideEffectOwners: SideEffectOwner[];
}

export interface TrendView {
  direction: 'improved' | 'regressed' | 'stable';
  summary: {
    scoreDelta: number;
    gradeBefore: string;
    gradeAfter: string;
    addedModules: number;
    removedModules: number;
    changedModules: number;
    newCycles: number;
    resolvedCycles: number;
    newSignals: number;
    regressedSignals: number;
    resolvedSignals: number;
  };
  changes: string[];
}

const SEVERITY_RANK: Record<SignalSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function buildMatrixView(
  scan: ScanResult,
  options: MatrixGrouping | BuildMatrixViewOptions = {},
): MatrixView {
  const opts: BuildMatrixViewOptions = typeof options === 'string' ? { groupBy: options } : options;
  const grouping = opts.groupBy ?? 'area';
  const moduleGroup = new Map(
    scan.modules.map((module) => [module.id, groupModule(module.id, grouping)]),
  );
  const cycleEdges = cycleEdgeKeys(scan);
  const violationEdges = new Set(
    scan.layerViolations.map((violation) => edgeKey(violation.from, violation.to)),
  );
  const cellsByKey = new Map<string, MatrixCell>();

  for (const edge of scan.edges) {
    if (!edge.resolved) continue;
    const from = moduleGroup.get(edge.from) ?? groupModule(edge.from, grouping);
    const to = moduleGroup.get(edge.to) ?? groupModule(edge.to, grouping);
    if (from === to) continue;
    const key = `${from}\u0001${to}`;
    const current = cellsByKey.get(key) ?? {
      from,
      to,
      imports: 0,
      violations: 0,
      cycleEdges: 0,
      edges: [],
    };
    const edgeHasViolation = violationEdges.has(edgeKey(edge.from, edge.to));
    const edgeInCycle = cycleEdges.has(edgeKey(edge.from, edge.to));
    current.imports += 1;
    if (edgeHasViolation) current.violations += 1;
    if (edgeInCycle) current.cycleEdges += 1;
    current.edges.push({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      specifier: edge.specifier,
      violation: edgeHasViolation,
      cycleEdge: edgeInCycle,
    });
    cellsByKey.set(key, current);
  }

  const groups = [...new Set([...moduleGroup.values()])].sort();
  let cells = [...cellsByKey.values()];
  if (opts.onlyViolations) cells = cells.filter((cell) => cell.violations > 0);
  if (opts.onlyCycles) cells = cells.filter((cell) => cell.cycleEdges > 0);
  cells.sort((a, b) => {
    const weight =
      b.violations * 1000 +
      b.cycleEdges * 100 +
      b.imports -
      (a.violations * 1000 + a.cycleEdges * 100 + a.imports);
    if (weight !== 0) return weight;
    const from = a.from.localeCompare(b.from);
    return from !== 0 ? from : a.to.localeCompare(b.to);
  });
  if (opts.top !== undefined) cells = cells.slice(0, opts.top);
  return {
    grouping,
    groups,
    cells,
    summary: {
      modules: scan.modules.length,
      imports: scan.edges.filter((edge) => edge.resolved).length,
      groups: groups.length,
      cells: cells.length,
      violations: cells.reduce((count, cell) => count + cell.violations, 0),
      cycleEdges: cells.reduce((count, cell) => count + cell.cycleEdges, 0),
    },
  };
}

export function buildImpactView(scan: ScanResult, target: ModuleId): ImpactView {
  const imports = sortedUnique(
    scan.edges.filter((edge) => edge.from === target).map((edge) => edge.to),
  );
  const importers = sortedUnique(
    scan.edges.filter((edge) => edge.to === target).map((edge) => edge.from),
  );
  const affectedModules = transitiveImporters(scan, target);
  const affectedAreas = sortedUnique(affectedModules.map(areaOf));
  const affectedFolders = sortedUnique(affectedModules.map(folderOf));
  const cyclesTouched = scan.cycles
    .filter((cycle) => cycle.modules.includes(target))
    .map((cycle) => cycle.id);
  const violationsTouched = scan.layerViolations.filter(
    (violation) => violation.from === target || violation.to === target,
  ).length;
  const relatedSignals = sortedUnique(
    (scan.signals ?? [])
      .filter((signal) => signal.modules.includes(target))
      .map((signal) => signal.stableKey),
  );
  const metrics = scan.metrics[target];

  return {
    target,
    imports,
    importers,
    affectedModules,
    affectedAreas,
    affectedFolders,
    cyclesTouched,
    violationsTouched,
    relatedSignals,
    metrics: {
      fanIn: metrics?.fanIn ?? 0,
      fanOut: metrics?.fanOut ?? 0,
      instability: metrics?.instability ?? 0,
      hotnessScore: metrics?.hotnessScore ?? 0,
    },
    risk: impactRisk({
      affectedModules: affectedModules.length,
      cyclesTouched: cyclesTouched.length,
      violationsTouched,
    }),
  };
}

export function resolveImpactTarget(scan: ScanResult, query: string): ModuleId | null {
  return findModuleMatches(scan, query, 1)[0] ?? null;
}

export function findModuleMatches(scan: ScanResult, query: string, limit = 10): ModuleId[] {
  if (scan.modules.some((module) => module.id === query)) return [query];
  const matches = scan.modules
    .map((module) => module.id)
    .filter((id) => id.includes(query))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return matches.slice(0, limit);
}

export function buildExplainView(
  scan: ScanResult,
  options: { signal?: string; cycle?: string; module?: string },
): ExplainView {
  if (options.signal) {
    const signal = (scan.signals ?? []).find(
      (item) => item.stableKey === options.signal || item.id === options.signal,
    );
    if (signal) {
      return {
        kind: 'signal',
        title: signal.title,
        severity: signal.severity,
        confidence: signal.confidence,
        evidence: signal.evidence.map((item) => item.message),
        modules: signal.modules,
        nextSteps: signalNextSteps(signal),
      };
    }
  }

  if (options.cycle) {
    const cycle = scan.cycles.find((item) => item.id === options.cycle);
    if (cycle) {
      const details = explainCycleDetails(scan, cycle);
      return {
        kind: 'cycle',
        title: `Cycle ${cycle.id}`,
        severity: cycle.severity,
        evidence: [
          `${cycle.length} modules`,
          `Affected areas: ${details.affectedAreas.join(', ')}; layers: ${details.affectedLayers.join(', ')}`,
          details.suggestedBreakpoint
            ? `Suggested break: ${details.suggestedBreakpoint.from} -> ${details.suggestedBreakpoint.to}`
            : 'No deterministic break point available',
        ],
        modules: cycle.modules,
        cycle: details,
        nextSteps: ['Review the suggested edge first.', 'Prefer type-only imports when safe.'],
      };
    }
  }

  if (options.module) {
    const target = resolveImpactTarget(scan, options.module);
    const module = target ? scan.modules.find((item) => item.id === target) : undefined;
    if (module) {
      const metrics = scan.metrics[module.id];
      const impact = buildImpactView(scan, module.id);
      return {
        kind: 'module',
        title: module.id,
        evidence: [
          `kind=${module.kind}`,
          `loc=${module.loc}`,
          `fanIn=${metrics?.fanIn ?? 0}`,
          `fanOut=${metrics?.fanOut ?? 0}`,
          `affectedModules=${impact.affectedModules.length}`,
        ],
        modules: [module.id],
        nextSteps: moduleNextSteps(scan, module.id, impact),
      };
    }
  }

  const topSignal = [...(scan.signals ?? [])].sort((a, b) => b.ranking.score - a.ranking.score)[0];
  return {
    kind: 'project',
    title: `${scan.project.name} architecture summary`,
    evidence: [
      `grade=${scan.archDebt.grade}`,
      `cycles=${scan.cycles.length}`,
      `layerViolations=${scan.layerViolations.length}`,
      `contractViolations=${scan.contractViolations.length}`,
      `configDiagnostics=${scan.configDiagnostics?.length ?? 0}`,
    ],
    modules: topSignal?.modules ?? [],
    nextSteps: projectNextSteps(scan),
    ...(topSignal?.severity ? { severity: topSignal.severity } : {}),
    ...(topSignal?.confidence ? { confidence: topSignal.confidence } : {}),
  };
}

function explainCycleDetails(
  scan: ScanResult,
  cycle: ScanResult['cycles'][number],
): ExplainCycleDetails {
  const violationEdges = new Set(
    scan.layerViolations.map((violation) => edgeKey(violation.from, violation.to)),
  );
  const edges = cyclePathEdges(scan, cycle, violationEdges);
  const fallbackBreakpoint =
    edges.find((edge) => edge.violatesBoundary) ??
    edges.find((edge) => edge.crossesLayer) ??
    edges[0];
  const suggestedBreakpoint = cycle.suggestedBreakpoint
    ? { ...cycle.suggestedBreakpoint, reason: 'analyzer' }
    : fallbackBreakpoint
      ? {
          from: fallbackBreakpoint.from,
          to: fallbackBreakpoint.to,
          reason: fallbackBreakpoint.violatesBoundary
            ? 'rule-violation'
            : fallbackBreakpoint.crossesLayer
              ? 'cross-layer'
              : 'cycle-edge',
        }
      : null;

  return {
    affectedAreas: sortedUnique(cycle.modules.map(areaOf)),
    affectedFolders: sortedUnique(cycle.modules.map(folderOf)),
    affectedLayers: sortedUnique(cycle.modules.map((id) => projectLayerName(detectLayer(id)))),
    edges,
    suggestedBreakpoint,
  };
}

function cyclePathEdges(
  scan: ScanResult,
  cycle: ScanResult['cycles'][number],
  violationEdges: ReadonlySet<string>,
): ExplainCycleEdge[] {
  const edgesByPair = new Map(scan.edges.map((edge) => [edgeKey(edge.from, edge.to), edge]));
  const path: ExplainCycleEdge[] = [];
  for (let index = 0; index < cycle.modules.length; index++) {
    const from = cycle.modules[index];
    const to = cycle.modules[(index + 1) % cycle.modules.length];
    if (!from || !to) continue;
    const edge = edgesByPair.get(edgeKey(from, to));
    if (!edge) continue;
    const fromLayer = projectLayerName(detectLayer(from));
    const toLayer = projectLayerName(detectLayer(to));
    path.push({
      from,
      to,
      kind: edge.kind,
      specifier: edge.specifier,
      fromLayer,
      toLayer,
      fromFolder: folderOf(from),
      toFolder: folderOf(to),
      crossesLayer: fromLayer !== toLayer,
      violatesBoundary: violationEdges.has(edgeKey(from, to)),
    });
  }
  return path;
}

export function buildSignalBaselineView(
  baseline: ScanResult | null,
  current: ScanResult,
): SignalBaselineView {
  if (!baseline) {
    const currentSignals = current.signals ?? [];
    return {
      current: currentSignals,
      resolved: [],
      newSignals: currentSignals,
      regressedSignals: [],
    };
  }
  const reconciled = reconcileSignalLifecycle(baseline.signals ?? [], current.signals ?? []);
  return {
    current: reconciled.current,
    resolved: reconciled.resolved,
    newSignals: reconciled.current.filter((signal) => signal.status === 'new'),
    regressedSignals: reconciled.current.filter((signal) => signal.status === 'regressed'),
  };
}

export function countBaselineSignals(
  view: SignalBaselineView,
  kind: 'new' | 'regressed',
  minSeverity: SignalSeverity,
): number {
  const source = kind === 'new' ? view.newSignals : view.regressedSignals;
  return source.filter(
    (signal) =>
      SEVERITY_RANK[signal.severity] >= SEVERITY_RANK[minSeverity] &&
      canSignalFailCi(signal, { minSeverity }),
  ).length;
}

function groupModule(id: ModuleId, grouping: MatrixGrouping): string {
  if (grouping === 'area') return areaOf(id);
  if (grouping === 'layer') return projectLayerName(detectLayer(id));
  if (grouping === 'package') return packageOf(id);
  return folderOf(id);
}

export function buildReviewRiskView(
  scan: ScanResult,
  options: { baseline?: ScanResult | null; diff?: ScanDiff | null } = {},
): ReviewRiskView {
  const reasons: string[] = [];
  const regressions: string[] = [];
  const reviewCycles = scan.cycles.filter((cycle) => cycle.modules.some(isReviewModule));
  const reviewViolations = scan.layerViolations.filter(
    (violation) => isReviewModule(violation.from) && isReviewModule(violation.to),
  );
  const reviewContractViolations = scan.contractViolations.filter((violation) =>
    violation.modules.some(isReviewModule),
  );
  const reviewHotZones = scan.hotZones.filter(isReviewModule);
  const reviewSignals = (scan.signals ?? []).filter((signal) =>
    signal.modules.some(isReviewModule),
  );
  const lifecycleHygiene = buildLifecycleHygieneView(scan);
  const directCycles = reviewCycles.filter((cycle) => cycle.severity === 'direct').length;
  const errorViolations = reviewViolations.filter(
    (violation) => violation.severity === 'error',
  ).length;
  const contractErrors = reviewContractViolations.filter(
    (violation) => violation.severity === 'error',
  ).length;
  const ciSignals = reviewSignals.filter((signal) =>
    canSignalFailCi(signal, { minSeverity: 'high' }),
  ).length;
  const hotspots = reviewHotZones.length;
  const lifecycleReviewOwners = lifecycleHygiene.sideEffectOwners.filter(
    (owner) => owner.placement === 'review',
  ).length;
  const lifecycleRisks =
    lifecycleHygiene.summary.memoryRisks + lifecycleHygiene.summary.asyncLifecycleRisks;
  const baselineView = options.baseline ? buildSignalBaselineView(options.baseline, scan) : null;
  const baseline = options.diff
    ? {
        addedModules: options.diff.summary.addedModules,
        changedModules: options.diff.summary.changedModules,
        removedModules: options.diff.summary.removedModules,
        newCycles: options.diff.summary.newCycles,
        resolvedCycles: options.diff.summary.resolvedCycles,
        newSignals: baselineView?.newSignals.length ?? 0,
        regressedSignals: baselineView?.regressedSignals.length ?? 0,
        resolvedSignals: baselineView?.resolved.length ?? 0,
      }
    : undefined;
  let score = scan.archDebt.score;
  score += directCycles * 12;
  score += errorViolations * 10;
  score += contractErrors * 10;
  score += ciSignals * 8;
  score += Math.min(15, hotspots * 2);
  score += Math.min(22, lifecycleReviewOwners * 12 + lifecycleRisks * 3);
  if (baseline) {
    score += baseline.newCycles * 15;
    score += baseline.regressedSignals * 10;
    score += baseline.newSignals * 5;
    score -= Math.min(15, baseline.resolvedCycles * 6 + baseline.resolvedSignals * 3);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (directCycles > 0) reasons.push(`${directCycles} direct cycle(s)`);
  if (errorViolations > 0) reasons.push(`${errorViolations} layer error(s)`);
  if (contractErrors > 0) reasons.push(`${contractErrors} contract error(s)`);
  if (ciSignals > 0) reasons.push(`${ciSignals} CI-safe high signal(s)`);
  if (hotspots > 0) reasons.push(`${hotspots} hot zone(s)`);
  if (lifecycleReviewOwners > 0) {
    reasons.push(`${lifecycleReviewOwners} lifecycle owner review(s)`);
  }
  if (baseline) {
    if (baseline.newCycles > 0) regressions.push(`${baseline.newCycles} new cycle(s)`);
    if (baseline.regressedSignals > 0) {
      regressions.push(`${baseline.regressedSignals} regressed signal(s)`);
    }
    if (baseline.newSignals > 0) regressions.push(`${baseline.newSignals} new signal(s)`);
    if (baseline.changedModules > 0) {
      regressions.push(`${baseline.changedModules} changed module(s)`);
    }
  }

  const level = score >= 80 ? 'critical' : score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';
  const checkFirst = sortedUnique([
    ...reviewHotZones.slice(0, 5),
    ...reviewCycles
      .slice(0, 3)
      .flatMap((cycle) => cycle.modules.filter(isReviewModule).slice(0, 2)),
    ...reviewViolations.slice(0, 3).flatMap((violation) => [violation.from, violation.to]),
    ...lifecycleHygiene.sideEffectOwners
      .filter((owner) => owner.placement === 'review')
      .slice(0, 3)
      .map((owner) => owner.id),
  ]).slice(0, 8);
  const affectedAreas = sortedUnique(checkFirst.map(areaOf));
  const guidedActions = buildGuidedReviewActions({
    cycles: reviewCycles,
    violations: reviewViolations,
    contractViolations: reviewContractViolations,
    signals: reviewSignals,
    hotZones: reviewHotZones,
    lifecycleOwners: lifecycleHygiene.sideEffectOwners,
  });
  return {
    score,
    level,
    summary:
      level === 'low'
        ? 'No blocking architecture risk found.'
        : 'Review architecture risk before broad changes or release.',
    reasons,
    guidedActions,
    checkFirst,
    affectedAreas,
    regressions,
    ...(baseline ? { baseline } : {}),
  };
}

function findingModules(scan: ScanResult): Set<ModuleId> {
  const ids = new Set<ModuleId>();
  for (const id of scan.hotZones) ids.add(id);
  for (const cycle of scan.cycles) {
    for (const id of cycle.modules) ids.add(id);
  }
  for (const violation of scan.layerViolations) {
    ids.add(violation.from);
    ids.add(violation.to);
  }
  for (const violation of scan.contractViolations) {
    for (const id of violation.modules) ids.add(id);
    if (violation.edge) {
      ids.add(violation.edge.from);
      ids.add(violation.edge.to);
    }
  }
  return ids;
}

function buildGuidedReviewActions(input: {
  cycles: Cycle[];
  violations: LayerViolation[];
  contractViolations: ScanResult['contractViolations'];
  signals: ArchitectureSignal[];
  hotZones: ModuleId[];
  lifecycleOwners: SideEffectOwner[];
}): GuidedReviewAction[] {
  const actions: GuidedReviewAction[] = [];
  const directCycle = input.cycles.find((cycle) => cycle.severity === 'direct') ?? input.cycles[0];
  if (directCycle) {
    actions.push({
      kind: 'cycle',
      title: 'Break cycle boundary',
      target: directCycle.suggestedBreakpoint?.from ?? directCycle.modules[0] ?? 'project',
      action: 'Move the narrowest dependency or introduce an explicit boundary.',
      evidence: `${directCycle.length} module cycle`,
      verify: 'Run review again and confirm the cycle no longer appears.',
    });
  }
  const violation =
    input.violations.find((item) => item.severity === 'error') ?? input.violations[0];
  if (violation) {
    actions.push({
      kind: 'rule',
      title: 'Fix layer boundary',
      target: violation.from,
      action: 'Move the dependency behind an allowed layer or adjust the rule.',
      evidence: `${violation.fromLayer} -> ${violation.toLayer}`,
      verify: 'Run check or review and confirm the layer violation count drops.',
    });
  }
  const contractViolation =
    input.contractViolations.find((item) => item.severity === 'error') ??
    input.contractViolations[0];
  if (contractViolation?.modules[0]) {
    actions.push({
      kind: 'contract',
      title: 'Check contract boundary',
      target: contractViolation.modules[0],
      action: 'Move the dependency behind an allowed boundary or update the contract.',
      evidence: contractViolation.message,
      verify: 'Run review again and confirm the contract violation is gone or explicitly accepted.',
    });
  }
  const signal = input.signals.find((item) => canSignalFailCi(item, { minSeverity: 'high' }));
  if (signal?.modules[0]) {
    actions.push({
      kind: 'signal',
      title: 'Review CI-safe signal',
      target: signal.modules[0],
      action: 'Separate blocking findings from review-only observations.',
      evidence: signal.evidence[0]?.message ?? signal.title,
      verify: 'Run review against the baseline and confirm no new CI-safe signal remains.',
    });
  }
  const lifecycleOwner = input.lifecycleOwners.find((owner) => owner.placement === 'review');
  if (lifecycleOwner) {
    actions.push({
      kind: 'lifecycle',
      title: 'Assign lifecycle owner',
      target: lifecycleOwner.id,
      action: 'Move browser side effects to an explicit hook, service, store, or route boundary.',
      evidence: `${lifecycleOwner.memoryRisks} memory, ${lifecycleOwner.asyncLifecycleRisks} async lifecycle`,
      verify: 'Run hygiene and confirm the module is no longer listed as a review boundary.',
    });
  }
  const hotspot = input.hotZones[0];
  if (hotspot) {
    actions.push({
      kind: 'hotspot',
      title: 'Review hotspot impact',
      target: hotspot,
      action: 'Open impact before changing this module.',
      evidence: 'Hot zone module',
      verify: 'Run impact for this module and check the top importers before editing.',
    });
  }
  return actions.slice(0, 5);
}

function projectLayerName(layer: string): string {
  return layer === 'unknown' ? 'project' : layer;
}

export function buildOwnershipView(scan: ScanResult): OwnershipView {
  const areas = new Map<string, OwnershipArea>();
  const findingIds = findingModules(scan);
  for (const module of scan.modules) {
    if (!isReviewModule(module.id)) continue;
    const area = areaOf(module.id);
    const current = areas.get(area) ?? {
      area,
      modules: 0,
      findings: 0,
      riskScore: 0,
      primaryKind: module.kind,
      ownerHint: area,
    };
    current.modules += 1;
    if (findingIds.has(module.id)) current.findings += 1;
    const metrics = scan.metrics[module.id];
    current.riskScore +=
      (metrics?.hotnessScore ?? 0) +
      (metrics?.couplingScore ?? 0) +
      (metrics?.fanIn ?? 0) +
      (metrics?.fanOut ?? 0) +
      (findingIds.has(module.id) ? 10 : 0);
    if (current.modules === 1 || module.kind !== 'module') current.primaryKind = module.kind;
    areas.set(area, current);
  }
  const sorted = [...areas.values()].sort(
    (a, b) => b.riskScore - a.riskScore || a.area.localeCompare(b.area),
  );
  return {
    areas: sorted,
    drift: sorted.filter(
      (area) => area.modules >= 3 && area.findings > 0 && area.findings / area.modules >= 0.3,
    ),
    unownedHotspots: scan.hotZones.filter(
      (id) => isReviewModule(id) && (areaOf(id) === 'project' || folderOf(id) === '.'),
    ),
  };
}

export function buildSemanticSurfaceView(scan: ScanResult): SemanticSurfaceView {
  const modules = scan.modules
    .filter((module) => !module.isInfra && isReviewModule(module.id))
    .map((module): SemanticSurfaceModule => {
      const metrics = scan.metrics[module.id];
      const exports = module.exports.length;
      const fanIn = metrics?.fanIn ?? 0;
      const fanOut = metrics?.fanOut ?? 0;
      return {
        id: module.id,
        exports,
        fanIn,
        fanOut,
        role: module.kind,
        risk: exports * 2 + fanIn * 3 + fanOut,
      };
    });
  const broadPublicModules = modules
    .filter((module) => module.exports >= 8 || (module.exports >= 4 && module.fanIn >= 4))
    .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id))
    .slice(0, 20);
  const quietExports = modules
    .filter(
      (module) =>
        module.exports > 0 &&
        module.fanIn === 0 &&
        module.role !== 'entry' &&
        module.role !== 'test',
    )
    .sort((a, b) => b.exports - a.exports || a.id.localeCompare(b.id))
    .slice(0, 20);
  const typeClusters = modules
    .filter(
      (module) =>
        module.role === 'schema' || /(^|\/)(types?|schemas?|models?)(\/|\.)/u.test(module.id),
    )
    .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id))
    .slice(0, 20);
  return { broadPublicModules, quietExports, typeClusters };
}

export function buildLifecycleHygieneView(scan: ScanResult): LifecycleHygieneView {
  const items = scan.modules
    .filter((module) => isReviewModule(module.id))
    .map((module): LifecycleHygieneItem => {
      const metrics = scan.metrics[module.id];
      const fanIn = metrics?.fanIn ?? 0;
      const fanOut = metrics?.fanOut ?? 0;
      const exports = module.exports.length;
      const loc = module.loc;
      return {
        id: module.id,
        reason: 'detached',
        fanIn,
        fanOut,
        exports,
        loc,
        risk: loc + exports * 4 + fanIn * 3 + fanOut * 2,
      };
    })
    .filter((item) => item.loc > 0);

  const sourceModules = new Map(scan.modules.map((module) => [module.id, module]));
  const removableCandidates = items
    .filter((item) => {
      const module = sourceModules.get(item.id);
      return (
        item.fanIn === 0 &&
        item.fanOut === 0 &&
        item.exports === 0 &&
        module?.kind !== 'entry' &&
        module?.kind !== 'test' &&
        !module?.isGenerated &&
        !module?.isInfra
      );
    })
    .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id))
    .slice(0, 30);

  const entryCandidates = items
    .filter((item) => {
      const module = sourceModules.get(item.id);
      return (
        item.fanIn === 0 &&
        item.fanOut > 0 &&
        module?.kind !== 'entry' &&
        module?.kind !== 'test' &&
        !module?.isGenerated
      );
    })
    .map((item) => ({ ...item, reason: 'entry-candidate' as const }))
    .sort((a, b) => b.fanOut - a.fanOut || b.risk - a.risk || a.id.localeCompare(b.id))
    .slice(0, 30);

  const generatedPressure = items
    .filter((item) => {
      const module = sourceModules.get(item.id);
      return Boolean(module?.isGenerated) && (item.fanIn + item.fanOut >= 20 || item.loc >= 500);
    })
    .map((item) => ({ ...item, reason: 'generated-pressure' as const }))
    .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id))
    .slice(0, 30);
  const lifecycleRiskModules = buildLifecycleRiskModules(scan);
  const sideEffectOwners = buildSideEffectOwners(scan);

  return {
    summary: {
      removableCandidates: removableCandidates.length,
      entryCandidates: entryCandidates.length,
      generatedPressure: generatedPressure.length,
      memoryRisks: scan.memoryRisks?.length ?? 0,
      asyncLifecycleRisks: scan.asyncLifecycleRisks?.length ?? 0,
      lifecycleRiskModules: lifecycleRiskModules.length,
      sideEffectOwners: sideEffectOwners.length,
    },
    removableCandidates,
    entryCandidates,
    generatedPressure,
    lifecycleRiskModules,
    sideEffectOwners,
  };
}

function buildSideEffectOwners(scan: ScanResult): SideEffectOwner[] {
  const modules = new Map(scan.modules.map((module) => [module.id, module]));
  const byModule = new Map<ModuleId, SideEffectOwner>();
  for (const risk of scan.memoryRisks ?? []) {
    const item = sideEffectOwnerFor(byModule, modules, risk.moduleId);
    item.memoryRisks += 1;
    item.totalRisks += 1;
  }
  for (const risk of scan.asyncLifecycleRisks ?? []) {
    const item = sideEffectOwnerFor(byModule, modules, risk.moduleId);
    item.asyncLifecycleRisks += 1;
    item.totalRisks += 1;
  }
  return [...byModule.values()]
    .sort(
      (a, b) =>
        placementRank(b.placement) - placementRank(a.placement) ||
        b.totalRisks - a.totalRisks ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 30);
}

function sideEffectOwnerFor(
  byModule: Map<ModuleId, SideEffectOwner>,
  modules: Map<ModuleId, ScanResult['modules'][number]>,
  id: ModuleId,
): SideEffectOwner {
  const existing = byModule.get(id);
  if (existing) return existing;
  const module = modules.get(id);
  const kind = module?.kind ?? 'module';
  const item: SideEffectOwner = {
    id,
    owner: ownerOf(id),
    layer: projectLayerName(detectLayer(id)),
    kind,
    memoryRisks: 0,
    asyncLifecycleRisks: 0,
    totalRisks: 0,
    placement: sideEffectPlacement(id, kind),
  };
  byModule.set(id, item);
  return item;
}

function sideEffectPlacement(
  id: ModuleId,
  kind: ScanResult['modules'][number]['kind'],
): SideEffectOwner['placement'] {
  if (/\/shared\/(lib|utils?|model|schema|config)(\/|\.)/u.test(id)) return 'review';
  if (kind === 'component' || kind === 'composable' || kind === 'service') return 'owned';
  if (kind === 'store' || kind === 'route' || kind === 'entry' || kind === 'integration') {
    return 'owned';
  }
  return 'review';
}

function placementRank(placement: SideEffectOwner['placement']): number {
  return placement === 'review' ? 1 : 0;
}

function buildLifecycleRiskModules(scan: ScanResult): LifecycleRiskModule[] {
  const byModule = new Map<ModuleId, LifecycleRiskModule>();
  for (const risk of scan.memoryRisks ?? []) {
    const item = lifecycleRiskItemFor(byModule, risk.moduleId);
    item.memoryRisks += 1;
    item.totalRisks += 1;
    item.confidence = higherConfidence(item.confidence, risk.confidence);
    item.severity = higherLifecycleSeverity(item.severity, risk.severity);
  }
  for (const risk of scan.asyncLifecycleRisks ?? []) {
    const item = lifecycleRiskItemFor(byModule, risk.moduleId);
    item.asyncLifecycleRisks += 1;
    item.totalRisks += 1;
    item.confidence = higherConfidence(item.confidence, risk.confidence);
    item.severity = higherLifecycleSeverity(item.severity, risk.severity);
  }
  return [...byModule.values()]
    .sort(
      (a, b) =>
        b.totalRisks - a.totalRisks ||
        confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 30);
}

function lifecycleRiskItemFor(
  byModule: Map<ModuleId, LifecycleRiskModule>,
  id: ModuleId,
): LifecycleRiskModule {
  const existing = byModule.get(id);
  if (existing) return existing;
  const item: LifecycleRiskModule = {
    id,
    memoryRisks: 0,
    asyncLifecycleRisks: 0,
    totalRisks: 0,
    confidence: 'low',
    severity: 'low',
  };
  byModule.set(id, item);
  return item;
}

function higherConfidence<T extends 'low' | 'medium' | 'high'>(a: T, b: T): T {
  return confidenceRank(a) >= confidenceRank(b) ? a : b;
}

function higherLifecycleSeverity<T extends 'low' | 'medium'>(a: T, b: T): T {
  return (a === 'medium' || b === 'medium' ? 'medium' : 'low') as T;
}

export function buildTrendView(baseline: ScanResult, current: ScanResult): TrendView {
  const diff = diffScans(baseline, current);
  const signals = buildSignalBaselineView(baseline, current);
  const scoreDelta = current.archDebt.score - baseline.archDebt.score;
  const summary = {
    scoreDelta,
    gradeBefore: baseline.archDebt.grade,
    gradeAfter: current.archDebt.grade,
    addedModules: diff.summary.addedModules,
    removedModules: diff.summary.removedModules,
    changedModules: diff.summary.changedModules,
    newCycles: diff.summary.newCycles,
    resolvedCycles: diff.summary.resolvedCycles,
    newSignals: signals.newSignals.length,
    regressedSignals: signals.regressedSignals.length,
    resolvedSignals: signals.resolved.length,
  };
  const changes: string[] = [];
  if (summary.addedModules > 0) changes.push(`${summary.addedModules} added module(s)`);
  if (summary.changedModules > 0) changes.push(`${summary.changedModules} changed module(s)`);
  if (summary.newCycles > 0) changes.push(`${summary.newCycles} new cycle(s)`);
  if (summary.resolvedCycles > 0) changes.push(`${summary.resolvedCycles} resolved cycle(s)`);
  if (summary.newSignals > 0) changes.push(`${summary.newSignals} new signal(s)`);
  if (summary.regressedSignals > 0) {
    changes.push(`${summary.regressedSignals} regressed signal(s)`);
  }
  if (summary.resolvedSignals > 0) changes.push(`${summary.resolvedSignals} resolved signal(s)`);

  const regressionWeight =
    Math.max(0, scoreDelta) +
    summary.newCycles * 12 +
    summary.regressedSignals * 10 +
    summary.newSignals * 4;
  const improvementWeight =
    Math.max(0, -scoreDelta) + summary.resolvedCycles * 8 + summary.resolvedSignals * 3;
  const direction =
    regressionWeight > improvementWeight + 5
      ? 'regressed'
      : improvementWeight > regressionWeight + 5
        ? 'improved'
        : 'stable';

  return { direction, summary, changes };
}

const DOMAIN_ROOTS = new Set([
  'domains',
  'entities',
  'features',
  'mfes',
  'modules',
  'pages',
  'services',
  'shared',
  'widgets',
]);

function areaOf(id: ModuleId): string {
  const parts = id.replace(/\\/gu, '/').split('/').filter(Boolean);
  const packagesIndex = parts.indexOf('packages');
  if (packagesIndex !== -1 && parts[packagesIndex + 1]) {
    return `packages/${parts[packagesIndex + 1]}`;
  }
  const appsIndex = parts.indexOf('apps');
  if (appsIndex !== -1 && parts[appsIndex + 1]) {
    return `apps/${parts[appsIndex + 1]}`;
  }

  const srcIndex = parts.indexOf('src');
  const scope = srcIndex === -1 ? parts : parts.slice(srcIndex + 1);
  const first = scope[0];
  if (!first) return 'project';
  if (isEntryFile(first)) return 'app';
  if (DOMAIN_ROOTS.has(first) && scope[1] && !isSourceFile(scope[1])) {
    return `${first}/${scope[1]}`;
  }
  return stripExtension(first);
}

function ownerOf(id: ModuleId): string {
  const parts = id.replace(/\\/gu, '/').split('/').filter(Boolean);
  const srcIndex = parts.indexOf('src');
  if (srcIndex !== -1 && parts[srcIndex + 1]) {
    const head = parts.slice(srcIndex, srcIndex + 3);
    const third = head[2];
    if (third && !isSourceFile(third)) return head.join('/');
    return parts[srcIndex] ?? 'src';
  }
  if (parts.length >= 2) return parts.slice(0, 2).join('/');
  return parts[0] ?? 'project';
}

function folderOf(id: ModuleId): string {
  const normalized = id.replace(/\\/gu, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '.' : normalized.slice(0, index);
}

function packageOf(id: ModuleId): string {
  const parts = id.replace(/\\/gu, '/').split('/');
  const packageIndex = parts.indexOf('packages');
  if (packageIndex !== -1 && parts[packageIndex + 1]) {
    return `packages/${parts[packageIndex + 1]}`;
  }
  const appIndex = parts.indexOf('apps');
  if (appIndex !== -1 && parts[appIndex + 1]) {
    return `apps/${parts[appIndex + 1]}`;
  }
  return folderOf(id);
}

function isEntryFile(part: string): boolean {
  return /^(App|app|main|index)\.[cm]?[jt]sx?$/u.test(part) || /^(App|app)\.vue$/u.test(part);
}

function isSourceFile(part: string): boolean {
  return /\.[cm]?[jt]sx?$/u.test(part) || /\.(vue|svelte)$/u.test(part);
}

function stripExtension(part: string): string {
  return part.replace(/\.[^.]+$/u, '');
}

function cycleEdgeKeys(scan: ScanResult): Set<string> {
  const keys = new Set<string>();
  for (const cycle of scan.cycles) {
    const members = new Set(cycle.modules);
    for (const edge of scan.edges) {
      if (members.has(edge.from) && members.has(edge.to)) keys.add(edgeKey(edge.from, edge.to));
    }
  }
  return keys;
}

function edgeKey(from: ModuleId, to: ModuleId): string {
  return `${from}\u0001${to}`;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function confidenceRank(value: 'low' | 'medium' | 'high'): number {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function transitiveImporters(scan: ScanResult, target: ModuleId): ModuleId[] {
  const byImported = new Map<ModuleId, ModuleId[]>();
  for (const edge of scan.edges) {
    const list = byImported.get(edge.to) ?? [];
    list.push(edge.from);
    byImported.set(edge.to, list);
  }
  const seen = new Set<ModuleId>();
  const queue = [...(byImported.get(target) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next === target) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(byImported.get(next) ?? []));
  }
  return [...seen].sort();
}

function impactRisk(input: {
  affectedModules: number;
  cyclesTouched: number;
  violationsTouched: number;
}): ImpactView['risk'] {
  if (input.cyclesTouched > 0 || input.violationsTouched > 1 || input.affectedModules >= 10) {
    return 'high';
  }
  if (input.violationsTouched > 0 || input.affectedModules >= 3) return 'medium';
  return 'low';
}

function signalNextSteps(signal: ArchitectureSignal): string[] {
  if (signal.kind === 'contract-violation') {
    return ['Open the matching contract rule.', 'Fix the edge or adjust the declared boundary.'];
  }
  if (signal.kind.includes('cycle')) {
    return ['Inspect the cycle members.', 'Break the suggested feedback edge first.'];
  }
  if (signal.kind === 'bundle-bloat') {
    return [
      'Check the bundle stats source.',
      'Move heavy imports behind lazy boundaries when possible.',
    ];
  }
  return ['Review the listed evidence.', 'Re-run the scan after the change.'];
}

function moduleNextSteps(scan: ScanResult, moduleId: ModuleId, impact: ImpactView): string[] {
  if (impact.cyclesTouched.length > 0) {
    return ['Open cycles touching this module.', 'Break the smallest deterministic cycle first.'];
  }
  if (impact.violationsTouched > 0) {
    return ['Review layer and contract violations touching this module.'];
  }
  if ((scan.metrics[moduleId]?.fanIn ?? 0) > 5) {
    return ['Treat this module as a high-impact change target.'];
  }
  return ['No immediate architecture action for this module.'];
}

function projectNextSteps(scan: ScanResult): string[] {
  if ((scan.configDiagnostics?.length ?? 0) > 0) {
    return ['Fix rules config diagnostics before enforcing project rules in CI.'];
  }
  if (scan.contractViolations.length > 0) return ['Resolve error-level contract violations first.'];
  if (scan.cycles.length > 0) return ['Break direct cycles before broad refactors.'];
  if (scan.hotZones.length > 0) return ['Review top hotspots for ownership and fan-in risk.'];
  return ['Keep the current baseline and fail CI on new regressions.'];
}
