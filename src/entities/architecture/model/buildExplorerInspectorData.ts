import type { DependencyEdge, LayerViolation, ModuleId, ScanResult } from '@/core/analyzer/types';
import { buildCyclesViewModel } from './buildCyclesViewModel';
import { createArchitectureViewContext } from './createArchitectureViewContext';
import { buildImpactViewModel } from './buildImpactViewModel';
import { buildRulesViewModel } from './buildRulesViewModel';
import { layerOf } from './helpers';
import type {
  ArchitectureRuleViolationItem,
  ArchitectureViewContext,
  ExplorerInspectorData,
  ExplorerInspectorCycleSummary,
  ExplorerInspectorImport,
  ExplorerInspectorImports,
  ExplorerInspectorRecommendation,
  ExplorerInspectorViolation,
  ExplorerInspectorViolationSummary,
  ExplorerInspectorImpactItem,
  ExplorerRiskFactor,
  ExplorerRiskSeverity,
  FolderExplorerItem,
  ImpactViewItem,
} from './types';

export function buildExplorerInspectorData(
  scan: ScanResult,
  item: FolderExplorerItem | undefined,
  viewContext?: ArchitectureViewContext,
): ExplorerInspectorData | null {
  if (!item) return null;

  const context = viewContext ?? createArchitectureViewContext(scan);
  const moduleIds = moduleIdsForFolder(scan, item.id);
  if (moduleIds.size === 0) return null;

  const imports = buildImports(scan, moduleIds);
  const cycles = buildCyclesViewModel(scan, { sortBy: 'risk' }, context).items.filter((cycle) =>
    cycle.modules.some((id) => moduleIds.has(id)),
  );
  const rules = buildRulesViewModel(scan, { sortBy: 'risk' }, context).items.filter(
    (violation) => moduleIds.has(violation.sourceModule) || moduleIds.has(violation.targetModule),
  );
  const impact = buildImpactViewModel(
    scan,
    item.id,
    {
      targetKind: 'folder',
      direction: 'both',
      depth: 2,
      sortBy: 'distance',
    },
    context,
  );
  const loc = scan.modules
    .filter((module) => moduleIds.has(module.id))
    .reduce((sum, module) => sum + module.loc, 0);
  const couplingScore = sumMetrics(scan, moduleIds, 'couplingScore');
  const dependenceScore = item.fanIn + item.fanOut;
  const impactRisk = impact.items.reduce((max, module) => Math.max(max, module.riskScore), 0);
  const violationCount = rules.length;
  const impactItems = impact.items.map(impactItem);

  return {
    summary: {
      loc,
      fanIn: item.fanIn,
      fanOut: item.fanOut,
      couplingScore,
      dependenceScore,
      incomingDeps: item.incomingDeps,
      outgoingDeps: item.outgoingDeps,
      cycleCount: item.cycleCount,
      violationCount,
      riskScore: item.riskScore,
      badges: [...item.badges],
      riskFactors: riskFactorsForItem({
        item,
        loc,
        violationCount,
        couplingScore,
        dependenceScore,
      }),
      whyRisk: whyRisk(item, violationCount),
    },
    imports,
    cycles: {
      items: cycles,
      primaryCycle: cycles[0] ?? null,
      summary: buildCycleSummary(cycles),
    },
    violations: {
      items: buildViolations(rules),
      summary: buildViolationSummary(rules),
    },
    impact: {
      affectedModulesCount: impact.summary.affectedModulesCount,
      affectedFilesCount: impact.summary.affectedModulesCount,
      affectedLayersCount: impact.summary.affectedLayersCount,
      changeRiskScore: impactRisk,
      changeRiskSeverity: severityForRisk(impactRisk),
      directCount: impact.summary.directCount,
      transitiveCount: impact.summary.transitiveCount,
      items: impactItems,
      incomingImporters: impact.incomingImporters.map(impactItem),
      outgoingImports: impact.outgoingImports.map(impactItem),
      riskyAffectedModules: impact.riskyAffectedModules.map(impactItem),
      primaryAction: impact.primaryAction,
      recommendations: impactRecommendations(impact.items),
    },
    recommendations: recommendationsForItem(item, violationCount),
  };
}

function moduleIdsForFolder(scan: ScanResult, folder: string): Set<ModuleId> {
  const prefix = folder === '.' ? '' : `${folder}/`;
  return new Set(
    scan.modules
      .filter((module) => module.id === folder || module.id.startsWith(prefix))
      .map((module) => module.id),
  );
}

function buildCycleSummary(
  cycles: ExplorerInspectorData['cycles']['items'],
): ExplorerInspectorCycleSummary {
  const relatedModuleIds = new Set<ModuleId>();
  const violationIds = new Set<string>();
  const hotZoneIds = new Set<ModuleId>();
  const importTypeCandidateIds = new Set<string>();

  for (const cycle of cycles) {
    for (const moduleId of cycle.modules) relatedModuleIds.add(moduleId);
    for (const hotZone of cycle.relatedHotZones) hotZoneIds.add(hotZone.id);
    for (const violation of cycle.relatedLayerViolations) violationIds.add(violation.id);
    for (const violation of cycle.relatedContractViolations) violationIds.add(violation.id);
    for (const edge of cycle.importTypeCandidates)
      importTypeCandidateIds.add(edgeKey(edge.from, edge.to));
  }

  return {
    cycleCount: cycles.length,
    relatedModuleCount: relatedModuleIds.size,
    violationCount: violationIds.size,
    hotZoneCount: hotZoneIds.size,
    importTypeCandidateCount: importTypeCandidateIds.size,
  };
}

function buildViolations(rules: ArchitectureRuleViolationItem[]): ExplorerInspectorViolation[] {
  return rules.map((violation) => ({
    ruleId: violation.id,
    kind: violation.kind,
    ruleName: violation.ruleName,
    severity: violation.severity,
    riskScore: violation.riskScore,
    from: violation.sourceModule,
    to: violation.targetModule,
    fromLayer: violation.sourceLayer,
    toLayer: violation.targetLayer,
    importPath: violation.importPath,
    ...violationMessageKeys(violation.kind),
    messageParams: {
      ruleName: violation.ruleName,
      sourceLayer: violation.sourceLayer,
      targetLayer: violation.targetLayer,
      sourceModule: violation.sourceModule,
      targetModule: violation.targetModule,
    },
    relatedCycles: [...violation.relatedCycles],
  }));
}

function buildViolationSummary(
  rules: ArchitectureRuleViolationItem[],
): ExplorerInspectorViolationSummary {
  return {
    totalCount: rules.length,
    criticalCount: rules.filter((violation) => violation.severity === 'error').length,
    warningCount: rules.filter((violation) => violation.severity === 'warning').length,
  };
}

function buildImports(
  scan: ScanResult,
  moduleIds: ReadonlySet<ModuleId>,
): ExplorerInspectorImports {
  const violationsByPair = new Map(
    scan.layerViolations.map((violation) => [edgeKey(violation.from, violation.to), violation]),
  );
  const outgoing = aggregateImports(
    scan.edges.filter((edge) => moduleIds.has(edge.from) && !moduleIds.has(edge.to)),
    violationsByPair,
  ).sort(compareOutgoingImport);
  const incoming = aggregateImports(
    scan.edges.filter((edge) => moduleIds.has(edge.to) && !moduleIds.has(edge.from)),
    violationsByPair,
  );
  const outgoingModules = new Set(outgoing.map((edge) => edge.to));
  const incomingModules = new Set(incoming.map((edge) => edge.from));
  const bothDirections = [
    ...outgoing.filter((edge) => incomingModules.has(edge.to)),
    ...incoming.filter((edge) => outgoingModules.has(edge.from)),
  ].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const uniqueModules = new Set([...outgoingModules, ...incomingModules]).size;

  return {
    outgoing,
    incoming,
    bothDirections,
    outgoingCount: outgoing.length,
    incomingCount: incoming.length,
    uniqueModuleCount: uniqueModules,
    uniqueModules,
  };
}

function aggregateImports(
  edges: DependencyEdge[],
  violationsByPair: ReadonlyMap<string, LayerViolation>,
): ExplorerInspectorImport[] {
  const imports = new Map<string, ExplorerInspectorImport>();
  for (const edge of edges) {
    const sourceLayer = layerOf(edge.from);
    const targetLayer = layerOf(edge.to);
    const key = `${edge.from}\u0001${edge.to}\u0001${edge.kind}`;
    const current = imports.get(key);
    if (current) {
      current.count++;
      current.evidence.push(importEvidence(edge));
      continue;
    }
    imports.set(key, {
      from: edge.from,
      to: edge.to,
      count: 1,
      kind: edge.kind,
      specifier: edge.specifier,
      sourceLayer,
      targetLayer,
      crossLayer: sourceLayer !== targetLayer,
      violation: violationsByPair.get(edgeKey(edge.from, edge.to)) ?? null,
      evidence: [importEvidence(edge)],
    });
  }
  return [...imports.values()];
}

function importEvidence(edge: DependencyEdge): ExplorerInspectorImport['evidence'][number] {
  return {
    sourcePath: edge.from,
    targetPath: edge.to,
    specifier: edge.specifier,
    resolved: edge.resolved,
    confidence: edge.confidence,
    resolutionKind: edge.resolutionKind,
    approximate: edge.approximate,
  };
}

function compareOutgoingImport(a: ExplorerInspectorImport, b: ExplorerInspectorImport): number {
  return layerSortKey(a.targetLayer) - layerSortKey(b.targetLayer) || a.to.localeCompare(b.to);
}

function layerSortKey(layer: string): number {
  const order = ['entities', 'features', 'widgets', 'pages', 'shared', 'app'];
  const index = order.indexOf(layer);
  return index === -1 ? order.length : index;
}

function riskFactorsForItem(input: {
  item: FolderExplorerItem;
  loc: number;
  violationCount: number;
  couplingScore: number;
  dependenceScore: number;
}): ExplorerRiskFactor[] {
  const { item, loc, violationCount, couplingScore, dependenceScore } = input;
  return [
    {
      id: 'cycles',
      value: item.cycleCount,
      severity: item.cycleCount > 0 ? 'high' : 'low',
      valueType: 'number',
    },
    {
      id: 'violations',
      value: violationCount,
      severity: violationCount > 0 ? 'high' : 'low',
      valueType: 'number',
    },
    {
      id: 'fan-out',
      value: item.outgoingDeps,
      severity: item.outgoingDeps >= 8 ? 'critical' : item.outgoingDeps >= 4 ? 'medium' : 'low',
      valueType: 'number',
    },
    {
      id: 'fan-in',
      value: item.incomingDeps,
      severity: item.incomingDeps >= 8 ? 'high' : item.incomingDeps >= 4 ? 'medium' : 'low',
      valueType: 'number',
    },
    {
      id: 'coupling',
      value: Math.round(couplingScore),
      severity: couplingScore >= 60 ? 'critical' : couplingScore >= 24 ? 'high' : 'low',
      valueType: 'number',
    },
    {
      id: 'dependence',
      value: dependenceScore,
      severity: dependenceScore >= 16 ? 'high' : dependenceScore >= 8 ? 'medium' : 'low',
      valueType: 'number',
    },
    {
      id: 'size',
      value: loc,
      severity: loc >= 2_000 ? 'medium' : 'low',
      valueType: 'number',
    },
  ];
}

function whyRisk(item: FolderExplorerItem, violationCount: number): string {
  const parts = [
    `${item.cycleCount} ${plural(item.cycleCount, 'cycle', 'cycles')}`,
    `${violationCount} ${plural(violationCount, 'violation', 'violations')}`,
    `${item.outgoingDeps} outgoing dependencies`,
    `${item.incomingDeps} incoming dependencies`,
  ];
  return `${item.id}: ${parts.join(', ')}.`;
}

function recommendationsForItem(
  item: FolderExplorerItem,
  violationCount: number,
): ExplorerInspectorRecommendation[] {
  const recommendations: ExplorerInspectorRecommendation[] = [];
  if (item.cycleCount > 0)
    recommendations.push({
      key: 'breakCycle',
      source: 'cycle',
      count: item.cycleCount,
    });
  if (violationCount > 0)
    recommendations.push({
      key: 'moveDependency',
      source: 'violation',
      count: violationCount,
    });
  if (item.badges.includes('FAN-OUT'))
    recommendations.push({ key: 'splitModule', source: 'fan-out' });
  if (item.badges.includes('FAN-IN'))
    recommendations.push({ key: 'stabilizeApi', source: 'fan-in' });
  if (item.isOrphaned) recommendations.push({ key: 'reviewOrphan', source: 'orphan' });
  if (recommendations.length === 0)
    recommendations.push({ key: 'keepBoundary', source: 'baseline' });
  return recommendations;
}

function impactRecommendations(
  items: ImpactViewItem[],
): Array<'reviewTransitive' | 'reviewHighRisk'> {
  if (items.length === 0) return [];
  const recommendations: Array<'reviewTransitive' | 'reviewHighRisk'> = [];
  if (items.some((item) => item.distance > 1)) {
    recommendations.push('reviewTransitive');
  }
  if (items.some((item) => item.riskScore >= 40)) {
    recommendations.push('reviewHighRisk');
  }
  return recommendations;
}

function impactItem(item: ImpactViewItem): ExplorerInspectorImpactItem {
  return {
    id: item.id,
    relation:
      item.distance > 1 ? 'transitive' : item.direction === 'dependency' ? 'import' : 'imported-by',
    distance: item.distance,
    riskScore: item.riskScore,
    layer: layerOf(item.id),
    via: [...item.via],
  };
}

function severityForRisk(score: number): ExplorerRiskSeverity {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'high';
  if (score >= 18) return 'medium';
  return 'low';
}

function sumMetrics(
  scan: ScanResult,
  moduleIds: ReadonlySet<ModuleId>,
  field: 'couplingScore',
): number {
  let total = 0;
  for (const id of moduleIds) total += scan.metrics[id]?.[field] ?? 0;
  return total;
}

function violationMessageKeys(
  kind: 'layer' | 'contract',
): Pick<
  ExplorerInspectorData['violations']['items'][number],
  'whatHappenedKey' | 'whyBadKey' | 'howToFixKey'
> {
  if (kind === 'contract') {
    return {
      whatHappenedKey: 'contractViolation',
      whyBadKey: 'contractRule',
      howToFixKey: 'enforceContract',
    };
  }
  return {
    whatHappenedKey: 'layerBoundaryCrossed',
    whyBadKey: 'layerDirection',
    howToFixKey: 'moveDependency',
  };
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0001${to}`;
}
