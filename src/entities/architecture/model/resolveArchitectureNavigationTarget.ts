import type { ArchitectureRuleViolationItem, CycleViewItem, FolderExplorerItem } from './types';
import {
  resolveExplorerSelectionTarget,
  type ExplorerSelectionTarget,
} from './resolveExplorerSelectionTarget';

export type ArchitectureNavigationTarget =
  | { kind: 'module'; id: string }
  | { kind: 'folder'; id: string }
  | { kind: 'rule'; id: string }
  | { kind: 'cycle'; id: string }
  | { kind: 'impact'; id: string };

export interface ArchitectureNavigationResolution {
  target: ArchitectureNavigationTarget;
  status: 'resolved' | 'not-found';
  explorer: ExplorerSelectionTarget | null;
  impactTargetId: string;
  cycleId?: string;
  ruleId?: string;
  attemptedIds: string[];
}

export function resolveArchitectureNavigationTarget(input: {
  explorerItems: readonly FolderExplorerItem[];
  cycles?: readonly CycleViewItem[];
  rules?: readonly ArchitectureRuleViolationItem[];
  target: ArchitectureNavigationTarget;
}): ArchitectureNavigationResolution {
  const attemptedIds = candidateIds(input);
  const explorer = firstExplorerMatch(input.explorerItems, attemptedIds);

  return {
    target: input.target,
    status: explorer ? 'resolved' : 'not-found',
    explorer,
    impactTargetId: attemptedIds[0] ?? input.target.id,
    ...(input.target.kind === 'cycle' ? { cycleId: input.target.id } : {}),
    ...(input.target.kind === 'rule' ? { ruleId: input.target.id } : {}),
    attemptedIds,
  };
}

function candidateIds(input: {
  cycles?: readonly CycleViewItem[];
  rules?: readonly ArchitectureRuleViolationItem[];
  target: ArchitectureNavigationTarget;
}): string[] {
  if (input.target.kind === 'cycle') {
    const cycle = input.cycles?.find((item) => item.id === input.target.id);
    return cycle ? [...cycle.modules] : [input.target.id];
  }

  if (input.target.kind === 'rule') {
    const rule = input.rules?.find((item) => item.id === input.target.id);
    return rule ? [rule.sourceModule, rule.targetModule] : [input.target.id];
  }

  return [input.target.id];
}

function firstExplorerMatch(
  items: readonly FolderExplorerItem[],
  candidates: readonly string[],
): ExplorerSelectionTarget | null {
  for (const candidate of candidates) {
    const resolved = resolveExplorerSelectionTarget(items, candidate);
    if (resolved) return resolved;
  }
  return null;
}
