import type { DependencyEdge, ModuleId, Recommendation, ScanResult } from '@/core/analyzer/types';
import {
  areaOf,
  buildRiskContext,
  cycleItem,
  layerOf,
  moduleFolder,
  riskItemForModule,
  uniqueSorted,
  violationItem,
} from './helpers';
import type {
  ArchitectureRiskItem,
  ArchitectureRuleViolationItem,
  ArchitectureViewContext,
  CycleBreakSuggestion,
  CycleEdgeItem,
  CycleGroup,
  CycleViewItem,
  CycleViewModelOptions,
  CyclesViewModel,
} from './types';

const HIGH_RISK_SCORE = 40;

export function buildCyclesViewModel(
  scan: ScanResult,
  options: CycleViewModelOptions = {},
  viewContext?: ArchitectureViewContext,
): CyclesViewModel {
  const context = viewContext?.risk ?? buildRiskContext(scan);
  const modulesById = new Map(scan.modules.map((module) => [module.id, module]));
  const edgesByPair = new Map(scan.edges.map((edge) => [edgeKey(edge.from, edge.to), edge]));
  const violationEdges = new Set(
    scan.layerViolations.map((violation) => edgeKey(violation.from, violation.to)),
  );
  const contractViolations = contractViolationItems(scan);
  const items = scan.cycles.map((cycle) => {
    const base = cycleItem(cycle);
    const moduleSet = new Set(cycle.modules);
    const riskItems = cycle.modules
      .map((id) => modulesById.get(id))
      .filter((module): module is ScanResult['modules'][number] => Boolean(module))
      .map((module) => riskItemForModule(module, context));
    const edges = cycleEdges(cycle.modules, edgesByPair, violationEdges);
    const relatedLayerViolations = scan.layerViolations
      .filter((violation) => moduleSet.has(violation.from) && moduleSet.has(violation.to))
      .map(violationItem);
    const relatedContractViolations = contractViolations.filter(
      (violation) => moduleSet.has(violation.sourceModule) || moduleSet.has(violation.targetModule),
    );
    const relatedHotZones = riskItems.filter((item) => context.hotZoneIds.has(item.id));
    const suggestedBreakpoints = breakSuggestions({
      edges,
      scan,
      moduleSet,
      riskItems,
      relatedLayerViolations,
      ...(cycle.suggestedBreakpoint ? { analyzerBreakpoint: cycle.suggestedBreakpoint } : {}),
    });
    const riskScore =
      riskItems.reduce((sum, item) => sum + item.riskScore, 0) +
      relatedLayerViolations.length * 12 +
      relatedContractViolations.length * 10;

    return {
      ...base,
      affectedAreas: uniqueSorted(cycle.modules.map(areaOf)),
      affectedLayers: uniqueSorted(cycle.modules.map(layerOf)),
      riskScore,
      fanInImpact: riskItems.reduce((sum, item) => sum + item.fanIn, 0),
      fanOutImpact: riskItems.reduce((sum, item) => sum + item.fanOut, 0),
      edges,
      relatedHotZones,
      relatedLayerViolations,
      relatedContractViolations,
      suggestedBreakpoints,
      importTypeCandidates: typeOnlyCandidates(scan, moduleSet),
    } satisfies CycleViewItem;
  });

  const filtered = filterCycles(items, options);
  const sorted = sortCycles(filtered, options.sortBy ?? 'risk');
  const selectedCycle =
    sorted.find((item) => item.id === options.selectedCycleId) ?? sorted[0] ?? null;

  return {
    items: sorted,
    groups: groupCycles(sorted, options.groupBy ?? 'none'),
    selectedCycle,
    totalCount: items.length,
    filteredCount: filtered.length,
  };
}

function filterCycles(items: CycleViewItem[], options: CycleViewModelOptions): CycleViewItem[] {
  const search = options.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (search && !matchesCycleSearch(item, search)) return false;
    if (options.onlyDirect && item.severity !== 'direct') return false;
    if (options.onlyIndirect && item.severity !== 'indirect') return false;
    if (options.onlyCrossLayer && item.affectedLayers.length < 2) return false;
    if (options.onlyCrossFolder && item.affectedFolders.length < 2) return false;
    if (options.onlyInvolvingHotZones && item.relatedHotZones.length === 0) return false;
    if (options.onlyInvolvingLayerViolations && item.relatedLayerViolations.length === 0)
      return false;
    if (options.onlyInvolvingContractViolations && item.relatedContractViolations.length === 0)
      return false;
    if (options.onlyHighRisk && item.riskScore < HIGH_RISK_SCORE) return false;
    return true;
  });
}

function matchesCycleSearch(item: CycleViewItem, search: string): boolean {
  return (
    item.id.toLowerCase().includes(search) ||
    item.modules.some((id) => id.toLowerCase().includes(search)) ||
    item.affectedFolders.some((folder) => folder.toLowerCase().includes(search)) ||
    item.affectedLayers.some((layer) => layer.toLowerCase().includes(search))
  );
}

function sortCycles(items: CycleViewItem[], sortBy: NonNullable<CycleViewModelOptions['sortBy']>) {
  return [...items].sort((a, b) => {
    const value = compareCycles(a, b, sortBy);
    return value === 0 ? a.id.localeCompare(b.id) : value;
  });
}

function compareCycles(
  a: CycleViewItem,
  b: CycleViewItem,
  sortBy: NonNullable<CycleViewModelOptions['sortBy']>,
): number {
  if (sortBy === 'length' || sortBy === 'affectedModules') return b.length - a.length;
  if (sortBy === 'impact') return b.fanInImpact + b.fanOutImpact - (a.fanInImpact + a.fanOutImpact);
  if (sortBy === 'folder') return first(a.affectedFolders).localeCompare(first(b.affectedFolders));
  if (sortBy === 'layer') return first(a.affectedLayers).localeCompare(first(b.affectedLayers));
  if (sortBy === 'kind') return a.severity.localeCompare(b.severity);
  return b.riskScore - a.riskScore;
}

function groupCycles(
  items: CycleViewItem[],
  groupBy: NonNullable<CycleViewModelOptions['groupBy']>,
): CycleGroup[] {
  if (groupBy === 'none') return [];
  const groups = new Map<string, CycleGroup>();
  for (const item of items) {
    const id = cycleGroupId(item, groupBy);
    const group = groups.get(id) ?? { id, label: id, count: 0, riskScore: 0 };
    group.count++;
    group.riskScore += item.riskScore;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.riskScore - a.riskScore || a.id.localeCompare(b.id));
}

function cycleGroupId(
  item: CycleViewItem,
  groupBy: Exclude<NonNullable<CycleViewModelOptions['groupBy']>, 'none'>,
): string {
  if (groupBy === 'folder') return first(item.affectedFolders) || 'project';
  if (groupBy === 'layer') return first(item.affectedLayers) || 'project';
  if (groupBy === 'risk') return item.riskScore >= HIGH_RISK_SCORE ? 'high' : 'normal';
  if (groupBy === 'size') return item.length <= 2 ? 'small' : item.length <= 5 ? 'medium' : 'large';
  return item.severity;
}

function cycleEdges(
  modules: ModuleId[],
  edgesByPair: Map<string, DependencyEdge>,
  violationEdges: ReadonlySet<string>,
): CycleEdgeItem[] {
  const edges: CycleEdgeItem[] = [];
  for (let index = 0; index < modules.length; index++) {
    const from = modules[index];
    const to = modules[(index + 1) % modules.length];
    if (!from || !to) continue;
    const edge = edgesByPair.get(edgeKey(from, to));
    if (!edge) return [];
    const fromLayer = layerOf(from);
    const toLayer = layerOf(to);
    edges.push({
      from,
      to,
      kind: edge?.kind ?? 'static',
      specifier: edge?.specifier ?? to,
      fromLayer,
      toLayer,
      fromFolder: moduleFolder(from),
      toFolder: moduleFolder(to),
      crossesLayer: fromLayer !== toLayer,
      violatesBoundary: violationEdges.has(edgeKey(from, to)),
    });
  }
  return edges;
}

function breakSuggestions(input: {
  edges: CycleEdgeItem[];
  scan: ScanResult;
  moduleSet: ReadonlySet<ModuleId>;
  riskItems: ArchitectureRiskItem[];
  relatedLayerViolations: ReturnType<typeof violationItem>[];
  analyzerBreakpoint?: { from: ModuleId; to: ModuleId };
}): CycleBreakSuggestion[] {
  if (input.edges.length === 0) return [];

  // Use the analyzer feedback-arc pick - same edge as recommendations.ts
  // and the fix-plan, keeping the three views in sync.
  if (input.analyzerBreakpoint) {
    const match = input.edges.find(
      (edge) =>
        edge.from === input.analyzerBreakpoint!.from && edge.to === input.analyzerBreakpoint!.to,
    );
    if (match) return [suggestionForEdge(match, input)];
  }

  const recommendationByPair = new Map<string, Recommendation>();
  for (const recommendation of input.scan.recommendations) {
    const feedback = recommendation.params.feedbackEdges;
    if (!Array.isArray(feedback)) continue;
    for (const edge of feedback) {
      if (typeof edge !== 'object' || edge === null) continue;
      const pair = edge as { from?: string; to?: string };
      if (pair.from && pair.to)
        recommendationByPair.set(edgeKey(pair.from, pair.to), recommendation);
    }
  }

  const fromRecommendation = input.edges
    .map((edge) => {
      const recommendation = recommendationByPair.get(edgeKey(edge.from, edge.to));
      return recommendation ? suggestionForEdge(edge, input, recommendation) : null;
    })
    .find((suggestion): suggestion is CycleBreakSuggestion => Boolean(suggestion));
  if (fromRecommendation) return [fromRecommendation];

  const ranked = input.edges
    .map((edge) => suggestionForEdge(edge, input))
    .sort(compareBreakSuggestions);
  return ranked[0] ? [ranked[0]] : [];
}

function suggestionForEdge(
  edge: CycleEdgeItem,
  input: {
    scan: ScanResult;
    riskItems: ArchitectureRiskItem[];
    relatedLayerViolations: ReturnType<typeof violationItem>[];
  },
  recommendation?: Recommendation,
): CycleBreakSuggestion {
  const violation = input.relatedLayerViolations.find(
    (item) => item.from === edge.from && item.to === edge.to,
  );
  const typeOnly = edge.kind === 'type-only';
  const crossLayer = layerOf(edge.from) !== layerOf(edge.to);
  const reasonKind = violation
    ? 'rule-violation'
    : typeOnly
      ? 'type-only-candidate'
      : crossLayer
        ? 'cross-layer'
        : 'low-import-count';
  const targetRisk = input.riskItems.find((item) => item.id === edge.to)?.riskScore ?? 0;
  const evidence = [
    ...(recommendation ? [recommendation.id] : []),
    ...(violation ? [violation.id] : []),
    edge.specifier,
  ];

  return {
    sourceId: edge.from,
    targetId: edge.to,
    reasonKind,
    impact: violation
      ? 'high'
      : targetRisk >= HIGH_RISK_SCORE
        ? 'high'
        : crossLayer
          ? 'medium'
          : 'low',
    confidence: recommendation || violation ? 'high' : crossLayer || typeOnly ? 'medium' : 'low',
    evidence,
    edge,
  };
}

function compareBreakSuggestions(a: CycleBreakSuggestion, b: CycleBreakSuggestion): number {
  const reason = reasonRank(a.reasonKind) - reasonRank(b.reasonKind);
  if (reason !== 0) return reason;
  const impact = impactRank(a.impact) - impactRank(b.impact);
  if (impact !== 0) return impact;
  return a.sourceId.localeCompare(b.sourceId) || a.targetId.localeCompare(b.targetId);
}

function reasonRank(reason: CycleBreakSuggestion['reasonKind']): number {
  if (reason === 'rule-violation') return 0;
  if (reason === 'type-only-candidate') return 1;
  if (reason === 'cross-layer') return 2;
  if (reason === 'low-import-count') return 3;
  return 4;
}

function impactRank(impact: CycleBreakSuggestion['impact']): number {
  if (impact === 'low') return 0;
  if (impact === 'medium') return 1;
  return 2;
}

function contractViolationItems(scan: ScanResult): ArchitectureRuleViolationItem[] {
  return scan.contractViolations.map((violation) => {
    const sourceModule = violation.edge?.from ?? violation.modules[0] ?? '';
    const targetModule = violation.edge?.to ?? violation.modules[1] ?? sourceModule;
    return {
      id: violation.id,
      kind: 'contract',
      ruleName: violation.ruleName,
      severity: violation.severity,
      sourceModule,
      targetModule,
      sourceLayer: layerOf(sourceModule),
      targetLayer: layerOf(targetModule),
      importPath: violation.edge?.specifier ?? violation.modules.join(', '),
      explanation: {
        kind: 'contract-rule',
        severity: violation.severity === 'error' ? 'high' : 'medium',
        i18nKey: 'widgets.architectureWorkspace.rules.contractExplanation',
        params: {
          ruleName: violation.ruleName,
        },
        evidence: [violation.id],
      },
      howToFix: {
        kind: 'enforce-contract',
        severity: violation.severity === 'error' ? 'high' : 'medium',
        i18nKey: 'widgets.architectureWorkspace.recommendations.enforceContract',
        params: {
          ruleName: violation.ruleName,
        },
        evidence: [violation.id],
      },
      riskScore: violation.severity === 'error' ? 30 : 18,
      relatedCycles: scan.cycles
        .filter(
          (cycle) => cycle.modules.includes(sourceModule) || cycle.modules.includes(targetModule),
        )
        .map((cycle) => cycle.id),
      relatedHotZones: [sourceModule, targetModule].filter((id) => scan.hotZones.includes(id)),
      relatedRecommendation:
        scan.recommendations.find((recommendation) =>
          recommendation.modules.some((id) => id === sourceModule || id === targetModule),
        ) ?? null,
    };
  });
}

function typeOnlyCandidates(scan: ScanResult, moduleSet: ReadonlySet<ModuleId>): CycleEdgeItem[] {
  const sourceIds = new Set(
    scan.recommendations
      .filter((recommendation) => recommendation.kind === 'type-only-candidate')
      .flatMap((recommendation) => recommendation.modules)
      .filter((id) => moduleSet.has(id)),
  );
  if (sourceIds.size === 0) return [];
  return scan.edges
    .filter((edge) => sourceIds.has(edge.from) && edge.kind === 'type-only')
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      specifier: edge.specifier,
      fromLayer: layerOf(edge.from),
      toLayer: layerOf(edge.to),
      fromFolder: moduleFolder(edge.from),
      toFolder: moduleFolder(edge.to),
      crossesLayer: layerOf(edge.from) !== layerOf(edge.to),
      violatesBoundary: false,
    }));
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0001${to}`;
}

function first(values: string[]): string {
  return values[0] ?? '';
}
