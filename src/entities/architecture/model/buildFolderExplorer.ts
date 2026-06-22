import type { ModuleId, ScanResult } from '@/core/analyzer/types';
import {
  buildRiskContext,
  contractViolationModuleIds,
  folderAtDepth,
  riskItemForModule,
  sortRiskItems,
} from './helpers';
import type {
  ArchitectureViewContext,
  FolderExplorer,
  FolderExplorerItem,
  FolderExplorerOptions,
  FolderModuleRows,
} from './types';

export function buildFolderExplorer(
  scan: ScanResult,
  options: FolderExplorerOptions = {},
  viewContext?: ArchitectureViewContext,
): FolderExplorer {
  const depth = options.depth ?? 3;
  const context = viewContext?.risk ?? buildRiskContext(scan);
  const modulesByFolder = new Map<string, ScanResult['modules']>();
  const folderByModule = new Map<ModuleId, string>();
  const outgoingDepsByFolder = new Map<string, number>();
  const incomingDepsByFolder = new Map<string, number>();
  const cycleCountByFolder = new Map<string, number>();
  const violationCountByFolder = new Map<string, number>();
  const memoryRiskCountByFolder = new Map<string, number>();
  const asyncLifecycleRiskCountByFolder = new Map<string, number>();

  for (const module of scan.modules) {
    const folder = folderAtDepth(module.id, depth);
    folderByModule.set(module.id, folder);
    const bucket = modulesByFolder.get(folder);
    if (bucket) bucket.push(module);
    else modulesByFolder.set(folder, [module]);
  }

  for (const edge of scan.edges) {
    const fromFolder = folderByModule.get(edge.from);
    const toFolder = folderByModule.get(edge.to);
    if (fromFolder) {
      outgoingDepsByFolder.set(fromFolder, (outgoingDepsByFolder.get(fromFolder) ?? 0) + 1);
    }
    if (toFolder && fromFolder !== toFolder) {
      incomingDepsByFolder.set(toFolder, (incomingDepsByFolder.get(toFolder) ?? 0) + 1);
    }
  }

  for (const cycle of scan.cycles) {
    const touchedFolders = new Set<string>();
    for (const moduleId of cycle.modules) {
      const folder = folderByModule.get(moduleId);
      if (folder) touchedFolders.add(folder);
    }
    for (const folder of touchedFolders) {
      cycleCountByFolder.set(folder, (cycleCountByFolder.get(folder) ?? 0) + 1);
    }
  }

  for (const violation of scan.layerViolations) {
    const fromFolder = folderByModule.get(violation.from);
    const toFolder = folderByModule.get(violation.to);
    incrementCount(violationCountByFolder, fromFolder);
    if (toFolder !== fromFolder) incrementCount(violationCountByFolder, toFolder);
  }

  for (const violation of scan.contractViolations) {
    const touchedFolders = new Set<string>();
    for (const moduleId of contractViolationModuleIds(violation)) {
      const folder = folderByModule.get(moduleId);
      if (folder) touchedFolders.add(folder);
    }
    for (const folder of touchedFolders) incrementCount(violationCountByFolder, folder);
  }

  for (const risk of scan.memoryRisks ?? []) {
    incrementCount(memoryRiskCountByFolder, folderByModule.get(risk.moduleId));
  }
  for (const risk of scan.asyncLifecycleRisks ?? []) {
    incrementCount(asyncLifecycleRiskCountByFolder, folderByModule.get(risk.moduleId));
  }

  const items: FolderExplorerItem[] = [];
  for (const [folder, modules] of modulesByFolder) {
    let fanIn = 0;
    let fanOut = 0;

    for (const module of modules) {
      const metrics = scan.metrics[module.id];
      fanIn += metrics?.fanIn ?? 0;
      fanOut += metrics?.fanOut ?? 0;
    }

    const outgoingDeps = outgoingDepsByFolder.get(folder) ?? 0;
    const incomingDeps = incomingDepsByFolder.get(folder) ?? 0;
    const cycleCount = cycleCountByFolder.get(folder) ?? 0;
    const violationCount = violationCountByFolder.get(folder) ?? 0;
    const memoryRiskCount = memoryRiskCountByFolder.get(folder) ?? 0;
    const asyncLifecycleRiskCount = asyncLifecycleRiskCountByFolder.get(folder) ?? 0;
    const hasHotModule = modules.some((module) => context.hotZoneIds.has(module.id));
    const topFiles = sortRiskItems(
      modules.map((module) => riskItemForModule(module, context)),
    ).slice(0, 5);
    const riskScore = topFiles.reduce((total, item) => total + item.riskScore, 0);
    const isOrphaned = incomingDeps === 0 && outgoingDeps === 0;
    // Folder counts as generated when every module under it matches the
    // `analysis.generated` policy. A mixed folder stays a regular evidence
    // target so the user-code half still shows up as a real risk.
    const isGenerated = modules.length > 0 && modules.every((m) => m.isGenerated === true);

    items.push({
      id: folder,
      label: folderLabel(folder),
      type: 'folder',
      layer: modules[0] ? folderLayer(modules[0].id) : folderLayer(folder),
      depth: folder.split('/').filter(Boolean).length,
      fileCount: modules.length,
      outgoingDeps,
      incomingDeps,
      cycleCount,
      violationCount,
      memoryRiskCount,
      asyncLifecycleRiskCount,
      fanIn,
      fanOut,
      riskScore,
      isOrphaned,
      hasHotModule,
      isGenerated,
      badges: folderBadges({
        hasHotModule,
        isOrphaned,
        incomingDeps,
        outgoingDeps,
        cycleCount,
        violationCount,
        memoryRiskCount,
        asyncLifecycleRiskCount,
        isGenerated,
      }),
      topFiles,
    });
  }

  const filteredItems = filterItems(items, options);
  return {
    items: sortItems(filteredItems, options),
    totalCount: items.length,
    filteredCount: filteredItems.length,
  };
}

export function buildFolderModuleRows(
  scan: ScanResult,
  options: {
    folderId: string;
    depth?: number;
    limit?: number;
  },
  viewContext?: ArchitectureViewContext,
): FolderModuleRows {
  const depth = options.depth ?? 3;
  const limit = Math.max(1, options.limit ?? 24);
  const context = viewContext?.risk ?? buildRiskContext(scan);
  const items = sortRiskItems(
    scan.modules
      .filter((module) => folderAtDepth(module.id, depth) === options.folderId)
      .map((module) => riskItemForModule(module, context)),
  );

  return {
    items: items.slice(0, limit),
    totalCount: items.length,
    visibleCount: Math.min(items.length, limit),
  };
}

function incrementCount(counts: Map<string, number>, key: string | undefined): void {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function folderLabel(folder: string): string {
  const parts = folder.split('/').filter(Boolean);
  return parts.at(-1) ?? folder;
}

function folderBadges(input: {
  hasHotModule: boolean;
  isOrphaned: boolean;
  incomingDeps: number;
  outgoingDeps: number;
  cycleCount: number;
  violationCount: number;
  memoryRiskCount: number;
  asyncLifecycleRiskCount: number;
  isGenerated: boolean;
}): string[] {
  const badges: string[] = [];
  if (input.isGenerated) badges.push('GENERATED');
  if (input.hasHotModule) badges.push('HOT');
  if (input.isOrphaned) badges.push('ORPHAN');
  if (input.incomingDeps > input.outgoingDeps) badges.push('FAN-IN');
  if (input.outgoingDeps > input.incomingDeps * 2 && input.outgoingDeps > 2) badges.push('FAN-OUT');
  if (input.cycleCount > 0) badges.push('CYCLE');
  if (input.violationCount > 0) badges.push('VIOLATION');
  if (input.memoryRiskCount > 0) badges.push('MEMORY');
  if (input.asyncLifecycleRiskCount > 0) badges.push('ASYNC');
  return badges;
}

function folderLayer(id: string): string {
  const parts = id.split('/').filter(Boolean);
  if (parts[0] === 'src' && parts[1]) return parts[1];
  return parts[0] ?? 'project';
}

function filterItems(
  items: FolderExplorerItem[],
  options: FolderExplorerOptions,
): FolderExplorerItem[] {
  const search = options.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (search && !item.id.toLowerCase().includes(search)) return false;
    if (options.layer && options.layer !== 'all' && item.layer !== options.layer) return false;
    if (options.onlyCycles && item.cycleCount === 0) return false;
    if (options.onlyViolations && item.violationCount === 0) return false;
    if (options.onlyHotZones && !item.hasHotModule) return false;
    if (options.onlyMemoryRisks && item.memoryRiskCount === 0) return false;
    if (options.onlyAsyncLifecycleRisks && item.asyncLifecycleRiskCount === 0) return false;
    if (options.onlyOrphaned && !item.isOrphaned) return false;
    if (options.onlyHighFanOut && !item.badges.includes('FAN-OUT')) return false;
    if (options.onlyHighFanIn && !item.badges.includes('FAN-IN')) return false;
    return true;
  });
}

function sortItems(
  items: FolderExplorerItem[],
  options: FolderExplorerOptions,
): FolderExplorerItem[] {
  const sortBy = options.sortBy ?? 'riskScore';
  const direction = options.sortDirection ?? 'desc';
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const value = compareBy(a, b, sortBy);
    return value === 0 ? a.id.localeCompare(b.id) : value * multiplier;
  });
}

function compareBy(
  a: FolderExplorerItem,
  b: FolderExplorerItem,
  sortBy: NonNullable<FolderExplorerOptions['sortBy']>,
): number {
  if (sortBy === 'path') return a.id.localeCompare(b.id);
  if (sortBy === 'fileCount') return a.fileCount - b.fileCount;
  if (sortBy === 'imports') return a.outgoingDeps - b.outgoingDeps;
  if (sortBy === 'importedBy') return a.incomingDeps - b.incomingDeps;
  if (sortBy === 'fanIn') return a.fanIn - b.fanIn;
  if (sortBy === 'fanOut') return a.fanOut - b.fanOut;
  if (sortBy === 'cycles') return a.cycleCount - b.cycleCount;
  if (sortBy === 'violations') return a.violationCount - b.violationCount;
  return a.riskScore - b.riskScore;
}
