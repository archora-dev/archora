import type { LayerViolation, ScanResult } from '@/core/analyzer/types';
import { areaOf, folderAtDepth, layerOf, packageOf } from './helpers';
import type {
  ArchitectureGrouping,
  ArchitectureViewContext,
  DependencyMatrix,
  DependencyMatrixCell,
  DependencyMatrixOptions,
} from './types';

export function buildDependencyMatrix(
  scan: ScanResult,
  options: DependencyMatrixOptions,
  viewContext?: ArchitectureViewContext,
): DependencyMatrix {
  void viewContext;
  const moduleGroups = new Map(
    scan.modules.map((module) => [module.id, groupFor(module.id, options.grouping)]),
  );
  const violationByEdge = new Map(
    scan.layerViolations.map((violation) => [edgeKey(violation.from, violation.to), violation]),
  );
  const cycleEdges = new Set(
    scan.cycles.flatMap((cycle) =>
      cycle.modules.map((from, index) =>
        edgeKey(from, cycle.modules[(index + 1) % cycle.modules.length] ?? from),
      ),
    ),
  );
  const groups: string[] = [];
  const groupSet = new Set<string>();
  const cells = new Map<string, DependencyMatrixCell>();

  for (const edge of scan.edges) {
    const from = moduleGroups.get(edge.from);
    const to = moduleGroups.get(edge.to);
    if (!from || !to || from === to) continue;
    const violation = violationByEdge.get(edgeKey(edge.from, edge.to)) ?? null;
    if (options.violationOnly && !violation) continue;
    addGroup(groups, groupSet, from);
    addGroup(groups, groupSet, to);

    const key = edgeKey(from, to);
    const cell =
      cells.get(key) ??
      ({
        from,
        to,
        count: 0,
        violationCount: 0,
        severity: 'normal',
        imports: [],
      } satisfies DependencyMatrixCell);
    cell.count++;
    if (violation) {
      cell.violationCount++;
      cell.severity = mergeSeverity(cell.severity, violation);
    }
    cell.imports.push({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      specifier: edge.specifier,
      violation,
      cycleEdge: cycleEdges.has(edgeKey(edge.from, edge.to)),
    });
    cells.set(key, cell);
  }

  const groupOrder = new Map(groups.map((group, index) => [group, index]));

  return {
    grouping: options.grouping,
    groups,
    cells: [...cells.values()].sort(
      (a, b) =>
        (groupOrder.get(a.from) ?? 0) - (groupOrder.get(b.from) ?? 0) ||
        (groupOrder.get(a.to) ?? 0) - (groupOrder.get(b.to) ?? 0),
    ),
  };
}

function groupFor(id: string, grouping: ArchitectureGrouping): string {
  if (grouping === 'area') return areaOf(id);
  if (grouping === 'layer') return layerOf(id);
  if (grouping === 'package') return packageOf(id);
  return folderAtDepth(id, 3);
}

function addGroup(groups: string[], groupSet: Set<string>, group: string): void {
  if (groupSet.has(group)) return;
  groupSet.add(group);
  groups.push(group);
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0001${to}`;
}

function mergeSeverity(
  current: DependencyMatrixCell['severity'],
  violation: LayerViolation,
): DependencyMatrixCell['severity'] {
  if (current === 'error' || violation.severity === 'error') return 'error';
  if (current === 'warning' || violation.severity === 'warning') return 'warning';
  return 'normal';
}
