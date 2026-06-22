import type {
  Cycle,
  LayerViolation,
  ModuleId,
  ModuleMetrics,
  ModuleNode,
  ScanResult,
} from '@/core/analyzer/types';
import { moduleLabel } from '@/shared/lib';
import type {
  ArchitectureCycleItem,
  ArchitectureModuleItem,
  ArchitectureRiskItem,
  ArchitectureViolationItem,
  ModuleRiskContext,
} from './types';

const DEFAULT_METRICS: ModuleMetrics = {
  fanIn: 0,
  fanOut: 0,
  instability: 0,
  depth: 0,
  inCycle: false,
  couplingScore: 0,
  hotnessScore: 0,
};

export function moduleFolder(id: ModuleId): string {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? '' : id.slice(0, slash);
}

export function layerOf(id: ModuleId): string {
  const parts = id.split('/').filter(Boolean);
  if (parts[0] === 'src' && parts[1]) return parts[1];
  return parts[0] ?? 'project';
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

export function areaOf(id: ModuleId): string {
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

export function packageOf(id: ModuleId): string {
  const parts = id.replace(/\\/gu, '/').split('/').filter(Boolean);
  const packagesIndex = parts.indexOf('packages');
  if (packagesIndex !== -1 && parts[packagesIndex + 1]) {
    return `packages/${parts[packagesIndex + 1]}`;
  }
  const appsIndex = parts.indexOf('apps');
  if (appsIndex !== -1 && parts[appsIndex + 1]) {
    return `apps/${parts[appsIndex + 1]}`;
  }
  return areaOf(id);
}

export function folderAtDepth(id: ModuleId, depth: number): string {
  const parts = id.split('/').filter(Boolean);
  const fileParts = parts.slice(0, -1);
  return fileParts.slice(0, Math.max(1, depth)).join('/');
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

export function buildRiskContext(scan: ScanResult): ModuleRiskContext {
  const cycleCountByModule = new Map<ModuleId, number>();
  for (const cycle of scan.cycles) {
    for (const id of cycle.modules) {
      cycleCountByModule.set(id, (cycleCountByModule.get(id) ?? 0) + 1);
    }
  }

  const violationCountByModule = new Map<ModuleId, number>();
  for (const violation of scan.layerViolations) {
    violationCountByModule.set(
      violation.from,
      (violationCountByModule.get(violation.from) ?? 0) + 1,
    );
    violationCountByModule.set(violation.to, (violationCountByModule.get(violation.to) ?? 0) + 1);
  }
  for (const violation of scan.contractViolations) {
    for (const moduleId of contractViolationModuleIds(violation)) {
      violationCountByModule.set(moduleId, (violationCountByModule.get(moduleId) ?? 0) + 1);
    }
  }

  return {
    cycleCountByModule,
    violationCountByModule,
    metricsByModule: scan.metrics,
    hotZoneIds: new Set(scan.hotZones),
  };
}

export function contractViolationModuleIds(
  violation: ScanResult['contractViolations'][number],
): ModuleId[] {
  const ids = [violation.edge?.from, violation.edge?.to, ...violation.modules].filter(
    (id): id is ModuleId => Boolean(id),
  );
  return uniqueSorted(ids);
}

export function riskItemForModule(
  module: ModuleNode,
  context: ModuleRiskContext,
): ArchitectureRiskItem {
  const metrics = context.metricsByModule[module.id] ?? DEFAULT_METRICS;
  const cycleCount = context.cycleCountByModule.get(module.id) ?? 0;
  const violationCount = context.violationCountByModule.get(module.id) ?? 0;
  const hotBonus = context.hotZoneIds.has(module.id) ? 10 : 0;
  const riskScore =
    metrics.hotnessScore +
    metrics.couplingScore +
    metrics.fanIn +
    metrics.fanOut +
    cycleCount * 12 +
    violationCount * 10 +
    hotBonus;

  return {
    id: module.id,
    label: moduleLabel(module.id),
    folder: moduleFolder(module.id),
    kind: module.kind,
    loc: module.loc,
    fanIn: metrics.fanIn,
    fanOut: metrics.fanOut,
    degree: metrics.fanIn + metrics.fanOut,
    cycleCount,
    violationCount,
    instability: metrics.instability,
    couplingScore: metrics.couplingScore,
    hotnessScore: metrics.hotnessScore,
    debtScore: riskScore,
    riskScore,
  };
}

export function cycleItem(cycle: Cycle): ArchitectureCycleItem {
  return {
    id: cycle.id,
    modules: [...cycle.modules],
    length: cycle.length,
    severity: cycle.severity,
    affectedFolders: uniqueSorted(cycle.modules.map(moduleFolder)),
    suggestedBreakPoint: null,
  };
}

export function violationItem(violation: LayerViolation): ArchitectureViolationItem {
  return {
    id: violation.edgeId,
    from: violation.from,
    to: violation.to,
    fromLayer: violation.fromLayer,
    toLayer: violation.toLayer,
    severity: violation.severity,
    message: {
      kind: 'layer-violation',
      severity: violation.severity === 'error' ? 'high' : 'medium',
      i18nKey: 'widgets.architectureWorkspace.violationMessage',
      params: {
        fromLayer: violation.fromLayer,
        toLayer: violation.toLayer,
      },
      evidence: [violation.edgeId],
    },
  };
}

export function moduleItem(module: ModuleNode): ArchitectureModuleItem {
  return {
    id: module.id,
    label: moduleLabel(module.id),
    folder: moduleFolder(module.id),
    loc: module.loc,
  };
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function sortRiskItems(items: ArchitectureRiskItem[]): ArchitectureRiskItem[] {
  return [...items].sort(
    (a, b) => b.riskScore - a.riskScore || b.degree - a.degree || a.id.localeCompare(b.id),
  );
}
