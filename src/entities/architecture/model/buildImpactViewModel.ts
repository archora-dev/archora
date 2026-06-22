import type { ModuleId, ScanResult } from '@/core/analyzer/types';
import { areaOf, folderAtDepth, layerOf, riskItemForModule } from './helpers';
import { createArchitectureViewContext } from './createArchitectureViewContext';
import type {
  ArchitectureViewContext,
  ImpactAction,
  ImpactGroup,
  ImpactTarget,
  ImpactViewItem,
  ImpactViewModel,
  ImpactViewModelOptions,
} from './types';

const DEFAULT_DEPTH = 1;
const HIGH_TARGET_FAN_THRESHOLD = 8;

export function buildImpactViewModel(
  scan: ScanResult,
  targetId: string,
  options: ImpactViewModelOptions = {},
  viewContext?: ArchitectureViewContext,
): ImpactViewModel {
  const direction = options.direction ?? 'both';
  const depth = options.depth ?? DEFAULT_DEPTH;
  const target = resolveTarget(scan, targetId, options.targetKind);
  if (!target) return emptyImpact(direction, depth);

  const context = viewContext ?? createArchitectureViewContext(scan);
  const riskContext = context.risk;
  const modulesById = context.modulesById;
  const targetIds = targetModuleIds(scan, target);
  const candidates = new Map<ModuleId, ImpactViewItem>();

  if (direction === 'dependencies' || direction === 'both') {
    collectImpactItems({
      modulesById,
      riskContext,
      adjacency: context.outgoingByModule,
      startIds: targetIds,
      depth,
      direction: 'dependency',
      candidates,
    });
  }
  if (direction === 'dependents' || direction === 'both') {
    collectImpactItems({
      modulesById,
      riskContext,
      adjacency: context.incomingByModule,
      startIds: targetIds,
      depth,
      direction: 'dependent',
      candidates,
    });
  }

  const items = sortImpactItems([...candidates.values()], options.sortBy ?? 'distance');
  const incomingImporters = sortImpactItems(
    items.filter((item) => item.distance === 1 && item.direction === 'dependent'),
    'path',
  );
  const outgoingImports = sortImpactItems(
    items.filter((item) => item.distance === 1 && item.direction === 'dependency'),
    'path',
  );
  const affectedIds = new Set(items.map((item) => item.id));
  const touchedIds = new Set([...targetIds, ...affectedIds]);
  const cyclesTouched = scan.cycles.filter((cycle) =>
    cycle.modules.some((id) => touchedIds.has(id)),
  ).length;
  const violationsTouched = scan.layerViolations.filter(
    (violation) => touchedIds.has(violation.from) || touchedIds.has(violation.to),
  ).length;
  const contractViolationsTouched = scan.contractViolations.filter((violation) =>
    violation.modules.some((id) => touchedIds.has(id)),
  ).length;
  const hotZonesTouched = [...touchedIds].filter((id) => riskContext.hotZoneIds.has(id)).length;
  const riskyAffectedModulesCount = [...touchedIds].filter(
    (id) =>
      riskContext.hotZoneIds.has(id) ||
      (riskContext.cycleCountByModule.get(id) ?? 0) > 0 ||
      (riskContext.violationCountByModule.get(id) ?? 0) > 0,
  ).length;
  const riskyAffectedModules = sortImpactItems(
    items.filter(
      (item) =>
        riskContext.hotZoneIds.has(item.id) ||
        (riskContext.cycleCountByModule.get(item.id) ?? 0) > 0 ||
        (riskContext.violationCountByModule.get(item.id) ?? 0) > 0,
    ),
    'risk',
  );
  const targetRiskItems = [...targetIds]
    .map((id) => modulesById.get(id))
    .filter((module): module is ScanResult['modules'][number] => Boolean(module))
    .map((module) => riskItemForModule(module, riskContext));
  const summary = {
    affectedModulesCount: items.length,
    affectedAreasCount: new Set(items.map((item) => areaOf(item.id))).size,
    affectedFoldersCount: new Set(items.map((item) => folderAtDepth(item.id, 3))).size,
    affectedLayersCount: new Set(items.map((item) => layerOf(item.id))).size,
    riskyAffectedModulesCount,
    cyclesTouched,
    violationsTouched: violationsTouched + contractViolationsTouched,
    hotZonesTouched,
    directCount: items.filter((item) => item.distance === 1).length,
    transitiveCount: items.filter((item) => item.distance > 1).length,
  };

  return {
    empty: false,
    target,
    direction,
    depth,
    items,
    groups: groupImpactItems(items, options.groupBy ?? 'none'),
    incomingImporters,
    outgoingImports,
    riskyAffectedModules,
    primaryAction: impactAction(targetRiskItems, summary),
    summary,
  };
}

function collectImpactItems(input: {
  modulesById: ReadonlyMap<ModuleId, ScanResult['modules'][number]>;
  riskContext: ArchitectureViewContext['risk'];
  adjacency: ArchitectureViewContext['outgoingByModule'];
  startIds: ReadonlySet<ModuleId>;
  depth: number;
  direction: ImpactViewItem['direction'];
  candidates: Map<ModuleId, ImpactViewItem>;
}): void {
  const queue = [...input.startIds].map((id) => ({ id, distance: 0, via: [] as ModuleId[] }));
  const visited = new Set(input.startIds);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= input.depth) continue;
    for (const next of input.adjacency.get(current.id) ?? []) {
      if (input.startIds.has(next) || visited.has(next)) continue;
      visited.add(next);
      const distance = current.distance + 1;
      const module = input.modulesById.get(next);
      if (module) {
        const risk = riskItemForModule(module, input.riskContext);
        const existing = input.candidates.get(next);
        if (!existing || distance < existing.distance) {
          input.candidates.set(next, {
            ...risk,
            direction: input.direction,
            distance,
            via: [...current.via, current.id],
          });
        }
      }
      queue.push({ id: next, distance, via: [...current.via, current.id] });
    }
  }
}

function resolveTarget(
  scan: ScanResult,
  targetId: string,
  targetKind: ImpactViewModelOptions['targetKind'],
): ImpactTarget | null {
  if (!targetId) return null;
  const kind = targetKind ?? inferTargetKind(scan, targetId);
  const ids =
    kind === 'module'
      ? scan.modules.filter((module) => module.id === targetId).map((module) => module.id)
      : kind === 'area'
        ? scan.modules.filter((module) => areaOf(module.id) === targetId).map((module) => module.id)
        : kind === 'layer'
          ? scan.modules
              .filter((module) => layerOf(module.id) === targetId)
              .map((module) => module.id)
          : scan.modules
              .filter((module) => module.id === targetId || module.id.startsWith(`${targetId}/`))
              .map((module) => module.id);
  if (ids.length === 0) return null;
  return { id: targetId, kind, moduleCount: ids.length };
}

function inferTargetKind(scan: ScanResult, targetId: string): ImpactTarget['kind'] {
  if (scan.modules.some((module) => module.id === targetId)) return 'module';
  if (scan.modules.some((module) => areaOf(module.id) === targetId)) return 'area';
  if (scan.modules.some((module) => layerOf(module.id) === targetId)) return 'layer';
  return 'folder';
}

function targetModuleIds(scan: ScanResult, target: ImpactTarget): Set<ModuleId> {
  if (target.kind === 'module') return new Set([target.id]);
  if (target.kind === 'area') {
    return new Set(
      scan.modules.filter((module) => areaOf(module.id) === target.id).map((module) => module.id),
    );
  }
  if (target.kind === 'layer') {
    return new Set(
      scan.modules.filter((module) => layerOf(module.id) === target.id).map((module) => module.id),
    );
  }
  return new Set(
    scan.modules
      .filter((module) => module.id === target.id || module.id.startsWith(`${target.id}/`))
      .map((module) => module.id),
  );
}

function sortImpactItems(
  items: ImpactViewItem[],
  sortBy: NonNullable<ImpactViewModelOptions['sortBy']>,
): ImpactViewItem[] {
  return [...items].sort((a, b) => {
    const value = compareImpactItems(a, b, sortBy);
    return value === 0 ? a.id.localeCompare(b.id) : value;
  });
}

function compareImpactItems(
  a: ImpactViewItem,
  b: ImpactViewItem,
  sortBy: NonNullable<ImpactViewModelOptions['sortBy']>,
): number {
  if (sortBy === 'risk') return b.riskScore - a.riskScore;
  if (sortBy === 'fanIn') return b.fanIn - a.fanIn;
  if (sortBy === 'fanOut') return b.fanOut - a.fanOut;
  if (sortBy === 'path') return a.id.localeCompare(b.id);
  if (sortBy === 'area') return areaOf(a.id).localeCompare(areaOf(b.id));
  if (sortBy === 'folder') return a.folder.localeCompare(b.folder);
  if (sortBy === 'layer') return layerOf(a.id).localeCompare(layerOf(b.id));
  return a.distance - b.distance;
}

function groupImpactItems(
  items: ImpactViewItem[],
  groupBy: NonNullable<ImpactViewModelOptions['groupBy']>,
): ImpactGroup[] {
  if (groupBy === 'none') return [];
  const groups = new Map<string, ImpactGroup>();
  for (const item of items) {
    const id = impactGroupId(item, groupBy);
    const group = groups.get(id) ?? { id, label: id, count: 0, riskScore: 0 };
    group.count++;
    group.riskScore += item.riskScore;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function impactGroupId(
  item: ImpactViewItem,
  groupBy: Exclude<NonNullable<ImpactViewModelOptions['groupBy']>, 'none'>,
): string {
  if (groupBy === 'area') return areaOf(item.id);
  if (groupBy === 'folder') return folderAtDepth(item.id, 3);
  if (groupBy === 'layer') return layerOf(item.id);
  if (groupBy === 'kind') return item.direction;
  return String(item.distance);
}

function emptyImpact(
  direction: NonNullable<ImpactViewModelOptions['direction']>,
  depth: NonNullable<ImpactViewModelOptions['depth']>,
): ImpactViewModel {
  return {
    empty: true,
    target: null,
    direction,
    depth,
    items: [],
    groups: [],
    incomingImporters: [],
    outgoingImports: [],
    riskyAffectedModules: [],
    primaryAction: {
      key: 'keepBoundary',
      reason: 'low-risk',
      count: 0,
      evidence: [],
    },
    summary: {
      affectedModulesCount: 0,
      affectedAreasCount: 0,
      affectedFoldersCount: 0,
      affectedLayersCount: 0,
      riskyAffectedModulesCount: 0,
      cyclesTouched: 0,
      violationsTouched: 0,
      hotZonesTouched: 0,
      directCount: 0,
      transitiveCount: 0,
    },
  };
}

function impactAction(
  targetRiskItems: ImpactViewItem[] | ReturnType<typeof riskItemForModule>[],
  summary: ImpactViewModel['summary'],
): ImpactAction {
  const highFanIn = targetRiskItems.find((item) => item.fanIn >= HIGH_TARGET_FAN_THRESHOLD);
  if (highFanIn) {
    return {
      key: 'stabilizeApi',
      reason: 'high-fan-in',
      count: highFanIn.fanIn,
      evidence: [highFanIn.id],
    };
  }

  const highFanOut = targetRiskItems.find((item) => item.fanOut >= HIGH_TARGET_FAN_THRESHOLD);
  if (highFanOut) {
    return {
      key: 'splitModule',
      reason: 'high-fan-out',
      count: highFanOut.fanOut,
      evidence: [highFanOut.id],
    };
  }

  if (summary.cyclesTouched > 0) {
    return {
      key: 'breakCycle',
      reason: 'cycles-touched',
      count: summary.cyclesTouched,
      evidence: ['cycles'],
    };
  }

  if (summary.violationsTouched > 0) {
    return {
      key: 'moveDependency',
      reason: 'violations-touched',
      count: summary.violationsTouched,
      evidence: ['violations'],
    };
  }

  return {
    key: 'keepBoundary',
    reason: 'low-risk',
    count: 0,
    evidence: [],
  };
}
