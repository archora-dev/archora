import type { ModuleId, ScanResult } from '@/core/analyzer/types';
import {
  areaOf,
  cycleItem,
  folderAtDepth,
  moduleFolder,
  moduleItem,
  uniqueSorted,
  violationItem,
} from './helpers';
import type { ArchitectureModuleItem, ImpactSummary } from './types';

export function buildImpactSummary(scan: ScanResult, targetId: ModuleId): ImpactSummary {
  const modulesById = new Map(scan.modules.map((module) => [module.id, module]));
  const targetModules = scan.modules.filter(
    (module) => module.id === targetId || module.id.startsWith(`${targetId}/`),
  );
  const targetKind =
    targetModules.length === 1 && targetModules[0]?.id === targetId ? 'module' : 'folder';
  const targetIds = new Set(targetModules.map((module) => module.id));

  const imports = new Map<ModuleId, ArchitectureModuleItem>();
  const importers = new Map<ModuleId, ArchitectureModuleItem>();
  for (const edge of scan.edges) {
    const fromInTarget = targetIds.has(edge.from);
    const toInTarget = targetIds.has(edge.to);
    if (fromInTarget && !toInTarget) {
      const module = modulesById.get(edge.to);
      if (module) imports.set(module.id, moduleItem(module));
    }
    if (toInTarget && !fromInTarget) {
      const module = modulesById.get(edge.from);
      if (module) importers.set(module.id, moduleItem(module));
    }
  }

  const involvedIds = new Set<ModuleId>([...targetIds, ...imports.keys(), ...importers.keys()]);
  const affectedCycles = scan.cycles
    .filter((cycle) => cycle.modules.some((id) => involvedIds.has(id)))
    .map(cycleItem);
  const affectedViolations = scan.layerViolations
    .filter((violation) => involvedIds.has(violation.from) || involvedIds.has(violation.to))
    .map(violationItem);
  const affectedModules = [...targetIds, ...imports.keys()]
    .map((id) => modulesById.get(id))
    .filter((module): module is ScanResult['modules'][number] => Boolean(module))
    .map(moduleItem)
    .sort((a, b) => a.id.localeCompare(b.id));
  const affectedFolders = uniqueSorted([
    ...affectedModules.map((item) => folderAtDepth(item.id, 3)),
    ...[...importers.values()].map((item) => folderAtDepth(item.id, 3)),
  ]);
  const affectedAreas = uniqueSorted([
    ...affectedModules.map((item) => areaOf(item.id)),
    ...[...importers.values()].map((item) => areaOf(item.id)),
  ]);

  return {
    target: {
      id: targetId,
      kind: targetKind,
      moduleCount: targetModules.length,
    },
    importers: sortModuleItems([...importers.values()]),
    imports: sortModuleItems([...imports.values()]),
    affectedModules,
    affectedAreas,
    affectedFolders,
    affectedCycles,
    affectedViolations,
    summary: {
      kind: 'impact-summary',
      severity: affectedModules.length > 10 ? 'high' : 'info',
      i18nKey: 'widgets.architectureWorkspace.impactSummary',
      params: {
        target: targetId,
        modules: affectedModules.length,
        areas: affectedAreas.length,
        folders: affectedFolders.length,
      },
      evidence: [targetId],
    },
  };
}

function sortModuleItems(items: ArchitectureModuleItem[]): ArchitectureModuleItem[] {
  return [...items].sort(
    (a, b) => moduleFolder(a.id).localeCompare(moduleFolder(b.id)) || a.id.localeCompare(b.id),
  );
}
