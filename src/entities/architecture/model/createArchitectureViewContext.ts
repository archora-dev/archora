import type { ModuleId, Recommendation, ScanResult } from '@/core/analyzer/types';
import { buildRiskContext } from './helpers';
import type { ArchitectureViewContext } from './types';

export function createArchitectureViewContext(scan: ScanResult): ArchitectureViewContext {
  const incomingByModule = new Map<ModuleId, ModuleId[]>();
  const outgoingByModule = new Map<ModuleId, ModuleId[]>();
  for (const edge of scan.edges) {
    if (edge.kind === 'type-only') continue;
    pushMap(outgoingByModule, edge.from, edge.to);
    pushMap(incomingByModule, edge.to, edge.from);
  }

  const cyclesByModule = new Map<ModuleId, string[]>();
  const cycleOrder = new Map<string, number>();
  scan.cycles.forEach((cycle, index) => {
    cycleOrder.set(cycle.id, index);
    for (const moduleId of cycle.modules) pushMap(cyclesByModule, moduleId, cycle.id);
  });

  const recommendationsByModule = new Map<ModuleId, Recommendation[]>();
  const recommendationOrder = new Map<string, number>();
  scan.recommendations.forEach((recommendation, index) => {
    recommendationOrder.set(recommendation.id, index);
    for (const moduleId of recommendation.modules) {
      pushMap(recommendationsByModule, moduleId, recommendation);
    }
  });

  return {
    risk: buildRiskContext(scan),
    modulesById: new Map(scan.modules.map((module) => [module.id, module])),
    incomingByModule,
    outgoingByModule,
    cyclesByModule,
    cycleOrder,
    hotZoneIds: new Set(scan.hotZones),
    recommendationsByModule,
    recommendationOrder,
  };
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const items = map.get(key);
  if (items) items.push(value);
  else map.set(key, [value]);
}
