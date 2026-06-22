import type { ModuleId, Recommendation, ScanResult } from '@/core/analyzer/types';
import { createArchitectureViewContext } from './createArchitectureViewContext';
import { folderAtDepth, layerOf } from './helpers';
import type {
  ArchitectureRuleViolationItem,
  ArchitectureViewContext,
  RuleViolationGroup,
  RulesViewModel,
  RulesViewModelOptions,
} from './types';

export function buildRulesViewModel(
  scan: ScanResult,
  options: RulesViewModelOptions = {},
  viewContext?: ArchitectureViewContext,
): RulesViewModel {
  const context = viewContext ?? createArchitectureViewContext(scan);
  const items = [...layerViolationItems(scan, context), ...contractViolationItems(scan, context)];
  const filtered = filterRules(items, options);
  const sorted = sortRules(filtered, options.sortBy ?? 'risk');
  const selectedViolation =
    sorted.find((item) => item.id === options.selectedViolationId) ?? sorted[0] ?? null;

  return {
    items: sorted,
    groups: groupRules(sorted, options.groupBy ?? 'none'),
    selectedViolation,
    totalCount: items.length,
    filteredCount: filtered.length,
  };
}

function layerViolationItems(
  scan: ScanResult,
  context: ArchitectureViewContext,
): ArchitectureRuleViolationItem[] {
  return scan.layerViolations.map((violation) => {
    const relatedCycles = cycleIdsForModules(context, [violation.from, violation.to]);
    const relatedHotZones = hotZonesForModules(context, [violation.from, violation.to]);
    return {
      id: violation.edgeId,
      kind: 'layer',
      ruleName: 'Layer order',
      severity: violation.severity,
      sourceModule: violation.from,
      targetModule: violation.to,
      sourceLayer: violation.fromLayer,
      targetLayer: violation.toLayer,
      importPath: `${violation.from} -> ${violation.to}`,
      explanation: {
        kind: 'layer-rule',
        severity: violation.severity === 'error' ? 'high' : 'medium',
        i18nKey: 'widgets.architectureWorkspace.rules.layerExplanation',
        params: {
          fromLayer: violation.fromLayer,
          toLayer: violation.toLayer,
        },
        evidence: [violation.edgeId],
      },
      howToFix: {
        kind: 'move-dependency',
        severity: violation.severity === 'error' ? 'high' : 'medium',
        i18nKey: 'widgets.architectureWorkspace.recommendations.moveDependency',
        params: {
          sourceModule: violation.from,
          targetModule: violation.to,
        },
        evidence: [violation.edgeId],
      },
      riskScore:
        severityWeight(violation.severity) + relatedCycles.length * 10 + relatedHotZones.length * 6,
      relatedCycles,
      relatedHotZones,
      relatedRecommendation: recommendationForModules(context, [violation.from, violation.to]),
    };
  });
}

function contractViolationItems(
  scan: ScanResult,
  context: ArchitectureViewContext,
): ArchitectureRuleViolationItem[] {
  return scan.contractViolations.map((violation) => {
    const sourceModule = violation.edge?.from ?? violation.modules[0] ?? '';
    const targetModule = violation.edge?.to ?? violation.modules[1] ?? sourceModule;
    const modules = [sourceModule, targetModule].filter(Boolean);
    const relatedCycles = cycleIdsForModules(context, modules);
    const relatedHotZones = hotZonesForModules(context, modules);
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
      riskScore:
        severityWeight(violation.severity) + relatedCycles.length * 10 + relatedHotZones.length * 6,
      relatedCycles,
      relatedHotZones,
      relatedRecommendation: recommendationForModules(context, modules),
    };
  });
}

function filterRules(
  items: ArchitectureRuleViolationItem[],
  options: RulesViewModelOptions,
): ArchitectureRuleViolationItem[] {
  const search = options.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (search && !matchesRuleSearch(item, search)) return false;
    if (options.kinds && options.kinds.length > 0 && !options.kinds.includes(item.kind))
      return false;
    if (
      options.severities &&
      options.severities.length > 0 &&
      !options.severities.includes(item.severity)
    )
      return false;
    if (
      options.sourceLayer &&
      options.sourceLayer !== 'all' &&
      item.sourceLayer !== options.sourceLayer
    )
      return false;
    if (
      options.targetLayer &&
      options.targetLayer !== 'all' &&
      item.targetLayer !== options.targetLayer
    )
      return false;
    if (options.onlyRelatedToCycles && item.relatedCycles.length === 0) return false;
    if (options.onlyRelatedToHotZones && item.relatedHotZones.length === 0) return false;
    return true;
  });
}

function matchesRuleSearch(item: ArchitectureRuleViolationItem, search: string): boolean {
  return [
    item.sourceModule,
    item.targetModule,
    item.ruleName,
    item.sourceLayer,
    item.targetLayer,
    item.explanation.i18nKey,
    ...Object.values(item.explanation.params).map(String),
  ].some((value) => value.toLowerCase().includes(search));
}

function sortRules(
  items: ArchitectureRuleViolationItem[],
  sortBy: NonNullable<RulesViewModelOptions['sortBy']>,
): ArchitectureRuleViolationItem[] {
  return [...items].sort((a, b) => {
    const value = compareRules(a, b, sortBy);
    return value === 0 ? a.id.localeCompare(b.id) : value;
  });
}

function compareRules(
  a: ArchitectureRuleViolationItem,
  b: ArchitectureRuleViolationItem,
  sortBy: NonNullable<RulesViewModelOptions['sortBy']>,
): number {
  if (sortBy === 'violations') return b.relatedCycles.length - a.relatedCycles.length;
  if (sortBy === 'source') return a.sourceModule.localeCompare(b.sourceModule);
  if (sortBy === 'target') return a.targetModule.localeCompare(b.targetModule);
  if (sortBy === 'rule') return a.ruleName.localeCompare(b.ruleName);
  if (sortBy === 'modulePath') {
    return (
      a.sourceModule.localeCompare(b.sourceModule) || a.targetModule.localeCompare(b.targetModule)
    );
  }
  return b.riskScore - a.riskScore;
}

function groupRules(
  items: ArchitectureRuleViolationItem[],
  groupBy: NonNullable<RulesViewModelOptions['groupBy']>,
): RuleViolationGroup[] {
  if (groupBy === 'none') return [];
  const groups = new Map<string, RuleViolationGroup>();
  for (const item of items) {
    const id = ruleGroupId(item, groupBy);
    const group = groups.get(id) ?? { id, label: id, count: 0, riskScore: 0 };
    group.count++;
    group.riskScore += item.riskScore;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.riskScore - a.riskScore || a.id.localeCompare(b.id));
}

function ruleGroupId(
  item: ArchitectureRuleViolationItem,
  groupBy: Exclude<NonNullable<RulesViewModelOptions['groupBy']>, 'none'>,
): string {
  if (groupBy === 'rule') return item.ruleName;
  if (groupBy === 'sourceLayer') return item.sourceLayer;
  if (groupBy === 'targetLayer') return item.targetLayer;
  if (groupBy === 'folder') return folderAtDepth(item.sourceModule, 3);
  return item.severity;
}

function cycleIdsForModules(
  context: ArchitectureViewContext,
  modules: readonly ModuleId[],
): string[] {
  const ids = new Set<string>();
  for (const moduleId of modules) {
    for (const cycleId of context.cyclesByModule.get(moduleId) ?? []) ids.add(cycleId);
  }
  return [...ids].sort(
    (a, b) => (context.cycleOrder.get(a) ?? 0) - (context.cycleOrder.get(b) ?? 0),
  );
}

function hotZonesForModules(
  context: ArchitectureViewContext,
  modules: readonly ModuleId[],
): ModuleId[] {
  return modules.filter((moduleId) => context.hotZoneIds.has(moduleId));
}

function recommendationForModules(
  context: ArchitectureViewContext,
  modules: readonly ModuleId[],
): Recommendation | null {
  let match: Recommendation | null = null;
  for (const moduleId of modules) {
    for (const recommendation of context.recommendationsByModule.get(moduleId) ?? []) {
      if (
        !match ||
        (context.recommendationOrder.get(recommendation.id) ?? 0) <
          (context.recommendationOrder.get(match.id) ?? 0)
      ) {
        match = recommendation;
      }
    }
  }
  return match;
}

function severityWeight(severity: ArchitectureRuleViolationItem['severity']): number {
  if (severity === 'critical') return 40;
  if (severity === 'error') return 30;
  return 18;
}
