import type { ScanResult } from '@/core/analyzer/types';
import {
  buildRiskContext,
  cycleItem,
  areaOf,
  folderAtDepth,
  layerOf,
  moduleItem,
  riskItemForModule,
  sortRiskItems,
  violationItem,
} from './helpers';
import type {
  ArchitectureActionItem,
  ArchitectureAreaRisk,
  ArchitectureFolderRisk,
  ArchitectureLayerRisk,
  ArchitectureOverview,
  ArchitecturePriorityIssue,
  ArchitectureRiskItem,
} from './types';

const HOTSPOT_LIMIT = 8;
const CYCLE_LIMIT = 8;
const VIOLATION_LIMIT = 12;
const ISSUE_LIMIT = 5;
const RISK_LIMIT = 8;
const HIGH_FAN_THRESHOLD = 2;

export function buildArchitectureOverview(scan: ScanResult): ArchitectureOverview {
  const context = buildRiskContext(scan);
  const riskItems = scan.modules.map((module) => riskItemForModule(module, context));
  const orphanModules = scan.modules
    .filter((module) => {
      const metrics = scan.metrics[module.id];
      return (metrics?.fanIn ?? 0) === 0 && (metrics?.fanOut ?? 0) === 0;
    })
    .map(moduleItem)
    .sort((a, b) => a.id.localeCompare(b.id));
  const folderRisks = buildFolderRisks(scan, riskItems);
  const areaRisks = buildAreaRisks(scan, riskItems);
  const layerRisks = buildLayerRisks(scan, riskItems);

  return {
    totals: {
      modules: scan.modules.length,
      dependencies: scan.edges.length,
      domains: new Set(scan.modules.map((module) => areaOf(module.id))).size,
      cycles: scan.cycles.length,
      layerViolations: scan.layerViolations.length,
      hotZones: scan.hotZones.length,
      orphanModules: orphanModules.length,
    },
    topHotspots: sortRiskItems(riskItems).slice(0, HOTSPOT_LIMIT),
    topCycles: scan.cycles.map(cycleItem).slice(0, CYCLE_LIMIT),
    layerViolations: scan.layerViolations.map(violationItem).slice(0, VIOLATION_LIMIT),
    orphanModules,
    priorityIssues: priorityIssues(scan, riskItems, orphanModules.length),
    areaRisks,
    folderRisks,
    layerRisks,
    suggestedActions: suggestedActions(scan, orphanModules.length),
    health: {
      debtScore: scan.archDebt.score,
      grade: scan.archDebt.grade,
    },
  };
}

function priorityIssues(
  scan: ScanResult,
  riskItems: ArchitectureRiskItem[],
  orphanCount: number,
): ArchitecturePriorityIssue[] {
  const issues: ArchitecturePriorityIssue[] = [];
  const topRisk = sortRiskItems(riskItems);
  const highFanOut = topRisk.find((item) => item.fanOut >= HIGH_FAN_THRESHOLD);
  const highFanIn = topRisk.find((item) => item.fanIn >= HIGH_FAN_THRESHOLD);

  if (scan.cycles[0]) {
    issues.push({
      id: `cycle:${scan.cycles[0].id}`,
      kind: 'cycle',
      severity: scan.cycles[0].severity === 'direct' ? 'error' : 'warning',
      targetId: scan.cycles[0].id,
      affectedModules: scan.cycles[0].modules.length,
      recommendation: priorityRecommendationFact('cycle', 'high', {
        targetId: scan.cycles[0].id,
        affectedModules: scan.cycles[0].modules.length,
        evidence: [scan.cycles[0].id],
      }),
    });
  }
  if (scan.layerViolations[0]) {
    issues.push({
      id: `layer:${scan.layerViolations[0].edgeId}`,
      kind: 'layer-violation',
      severity: scan.layerViolations[0].severity,
      targetId: scan.layerViolations[0].edgeId,
      affectedModules: 2,
      recommendation: priorityRecommendationFact('layer-violation', 'high', {
        targetId: scan.layerViolations[0].edgeId,
        affectedModules: 2,
        evidence: [scan.layerViolations[0].edgeId],
      }),
    });
  }
  if (highFanOut) {
    issues.push({
      id: `fan-out:${highFanOut.id}`,
      kind: 'high-fan-out',
      severity: highFanOut.fanOut >= 8 ? 'error' : 'warning',
      targetId: highFanOut.id,
      affectedModules: highFanOut.fanOut,
      recommendation: priorityRecommendationFact('high-fan-out', 'medium', {
        targetId: highFanOut.id,
        affectedModules: highFanOut.fanOut,
        evidence: [highFanOut.id],
      }),
    });
  }
  if (highFanIn) {
    issues.push({
      id: `fan-in:${highFanIn.id}`,
      kind: 'high-fan-in',
      severity: highFanIn.fanIn >= 8 ? 'error' : 'warning',
      targetId: highFanIn.id,
      affectedModules: highFanIn.fanIn,
      recommendation: priorityRecommendationFact('high-fan-in', 'medium', {
        targetId: highFanIn.id,
        affectedModules: highFanIn.fanIn,
        evidence: [highFanIn.id],
      }),
    });
  }
  if (orphanCount > 0) {
    issues.push({
      id: 'orphan:modules',
      kind: 'orphan',
      severity: 'info',
      targetId: 'orphan modules',
      affectedModules: orphanCount,
      recommendation: priorityRecommendationFact('orphan', 'info', {
        targetId: 'orphan modules',
        affectedModules: orphanCount,
        evidence: ['orphan modules'],
      }),
    });
  }
  if (issues.length < ISSUE_LIMIT) {
    const unstable = topRisk.find((item) => item.fanIn > 0 && item.fanOut > item.fanIn * 2);
    if (unstable) {
      issues.push({
        id: `unstable:${unstable.id}`,
        kind: 'unstable-module',
        severity: 'warning',
        targetId: unstable.id,
        affectedModules: unstable.fanOut,
        recommendation: priorityRecommendationFact('unstable-module', 'medium', {
          targetId: unstable.id,
          affectedModules: unstable.fanOut,
          evidence: [unstable.id],
        }),
      });
    }
  }

  return issues.slice(0, ISSUE_LIMIT);
}

function buildFolderRisks(
  scan: ScanResult,
  items: ArchitectureRiskItem[],
): ArchitectureFolderRisk[] {
  const risks = new Map<string, ArchitectureFolderRisk>();
  const cycleIdsByFolder = new Map<string, Set<string>>();
  const violationIdsByFolder = new Map<string, Set<string>>();
  for (const item of items) {
    const folder = folderAtDepth(item.id, 3);
    const current =
      risks.get(folder) ??
      ({
        folder,
        layer: layerOf(item.id),
        area: areaOf(item.id),
        moduleCount: 0,
        fanIn: 0,
        fanOut: 0,
        cycleCount: 0,
        violationCount: 0,
        riskScore: 0,
      } satisfies ArchitectureFolderRisk);
    current.moduleCount++;
    current.fanIn += item.fanIn;
    current.fanOut += item.fanOut;
    current.riskScore += item.riskScore;
    risks.set(folder, current);
  }
  for (const cycle of scan.cycles) {
    for (const folder of new Set(cycle.modules.map((id) => folderAtDepth(id, 3)))) {
      const ids = cycleIdsByFolder.get(folder) ?? new Set<string>();
      ids.add(cycle.id);
      cycleIdsByFolder.set(folder, ids);
    }
  }
  for (const violation of scan.layerViolations) {
    for (const folder of [folderAtDepth(violation.from, 3), folderAtDepth(violation.to, 3)]) {
      const ids = violationIdsByFolder.get(folder) ?? new Set<string>();
      ids.add(violation.edgeId);
      violationIdsByFolder.set(folder, ids);
    }
  }
  for (const [folder, risk] of risks) {
    risk.cycleCount = cycleIdsByFolder.get(folder)?.size ?? 0;
    risk.violationCount = violationIdsByFolder.get(folder)?.size ?? 0;
  }
  return [...risks.values()].sort(sortRiskAggregate).slice(0, RISK_LIMIT);
}

function buildAreaRisks(scan: ScanResult, items: ArchitectureRiskItem[]): ArchitectureAreaRisk[] {
  const risks = new Map<string, ArchitectureAreaRisk>();
  const cycleIdsByArea = new Map<string, Set<string>>();
  const violationIdsByArea = new Map<string, Set<string>>();
  for (const item of items) {
    const area = areaOf(item.id);
    const current =
      risks.get(area) ??
      ({
        area,
        moduleCount: 0,
        fanIn: 0,
        fanOut: 0,
        cycleCount: 0,
        violationCount: 0,
        riskScore: 0,
      } satisfies ArchitectureAreaRisk);
    current.moduleCount++;
    current.fanIn += item.fanIn;
    current.fanOut += item.fanOut;
    current.riskScore += item.riskScore;
    risks.set(area, current);
  }
  for (const cycle of scan.cycles) {
    for (const area of new Set(cycle.modules.map(areaOf))) {
      const ids = cycleIdsByArea.get(area) ?? new Set<string>();
      ids.add(cycle.id);
      cycleIdsByArea.set(area, ids);
    }
  }
  for (const violation of scan.layerViolations) {
    for (const area of [areaOf(violation.from), areaOf(violation.to)]) {
      const ids = violationIdsByArea.get(area) ?? new Set<string>();
      ids.add(violation.edgeId);
      violationIdsByArea.set(area, ids);
    }
  }
  for (const [area, risk] of risks) {
    risk.cycleCount = cycleIdsByArea.get(area)?.size ?? 0;
    risk.violationCount = violationIdsByArea.get(area)?.size ?? 0;
  }
  return [...risks.values()].sort(sortRiskAggregate).slice(0, RISK_LIMIT);
}

function buildLayerRisks(scan: ScanResult, items: ArchitectureRiskItem[]): ArchitectureLayerRisk[] {
  const risks = new Map<string, ArchitectureLayerRisk>();
  const cycleIdsByLayer = new Map<string, Set<string>>();
  const violationIdsByLayer = new Map<string, Set<string>>();
  for (const item of items) {
    const layer = layerOf(item.id);
    const current =
      risks.get(layer) ??
      ({
        layer,
        moduleCount: 0,
        fanIn: 0,
        fanOut: 0,
        cycleCount: 0,
        violationCount: 0,
        riskScore: 0,
      } satisfies ArchitectureLayerRisk);
    current.moduleCount++;
    current.fanIn += item.fanIn;
    current.fanOut += item.fanOut;
    current.riskScore += item.riskScore;
    risks.set(layer, current);
  }
  for (const cycle of scan.cycles) {
    for (const layer of new Set(cycle.modules.map(layerOf))) {
      const ids = cycleIdsByLayer.get(layer) ?? new Set<string>();
      ids.add(cycle.id);
      cycleIdsByLayer.set(layer, ids);
    }
  }
  for (const violation of scan.layerViolations) {
    for (const layer of [violation.fromLayer, violation.toLayer]) {
      const ids = violationIdsByLayer.get(layer) ?? new Set<string>();
      ids.add(violation.edgeId);
      violationIdsByLayer.set(layer, ids);
    }
  }
  for (const [layer, risk] of risks) {
    risk.cycleCount = cycleIdsByLayer.get(layer)?.size ?? 0;
    risk.violationCount = violationIdsByLayer.get(layer)?.size ?? 0;
  }
  return [...risks.values()].sort(sortRiskAggregate).slice(0, RISK_LIMIT);
}

function sortRiskAggregate<T extends { riskScore: number; moduleCount: number }>(
  a: T,
  b: T,
): number {
  return b.riskScore - a.riskScore || b.moduleCount - a.moduleCount;
}

function suggestedActions(scan: ScanResult, orphanCount: number): ArchitectureActionItem[] {
  const actions: ArchitectureActionItem[] = [];
  if (scan.layerViolations.length > 0) {
    actions.push({
      kind: 'fix-layer-violation',
      i18nKey: 'widgets.architectureWorkspace.actions.fix-layer-violation',
      params: { count: scan.layerViolations.length },
      evidence: [scan.layerViolations[0]!.edgeId],
      targetId: scan.layerViolations[0]!.edgeId,
      count: scan.layerViolations.length,
    });
  }
  if (scan.cycles.length > 0) {
    actions.push({
      kind: 'break-cycle',
      i18nKey: 'widgets.architectureWorkspace.actions.break-cycle',
      params: { count: scan.cycles.length },
      evidence: [scan.cycles[0]!.id],
      targetId: scan.cycles[0]!.id,
      count: scan.cycles.length,
    });
  }
  if (scan.hotZones.length > 0) {
    actions.push({
      kind: 'review-hotspot',
      i18nKey: 'widgets.architectureWorkspace.actions.review-hotspot',
      params: { count: scan.hotZones.length },
      evidence: scan.hotZones[0] ? [scan.hotZones[0]] : [],
      ...(scan.hotZones[0] ? { targetId: scan.hotZones[0] } : {}),
      count: scan.hotZones.length,
    });
  }
  if (orphanCount > 0) {
    actions.push({
      kind: 'remove-orphan',
      i18nKey: 'widgets.architectureWorkspace.actions.remove-orphan',
      params: { count: orphanCount },
      evidence: ['orphan modules'],
      count: orphanCount,
    });
  }
  if (actions.length === 0 && scan.archDebt.score > 0) {
    actions.push({
      kind: 'reduce-coupling',
      i18nKey: 'widgets.architectureWorkspace.actions.reduce-coupling',
      params: { count: scan.archDebt.score },
      evidence: ['architecture debt'],
      count: scan.archDebt.score,
    });
  }
  return actions;
}

function priorityRecommendationFact(
  kind: ArchitecturePriorityIssue['kind'],
  severity: ArchitecturePriorityIssue['recommendation']['severity'],
  input: {
    targetId: string;
    affectedModules: number;
    evidence: string[];
  },
): ArchitecturePriorityIssue['recommendation'] {
  return {
    kind,
    severity,
    i18nKey: `widgets.architectureWorkspace.priorityRecommendations.${kind}`,
    params: {
      targetId: input.targetId,
      affectedModules: input.affectedModules,
    },
    evidence: input.evidence,
  };
}
