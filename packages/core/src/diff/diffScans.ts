import type { ContractViolation, Cycle, LayerViolation, ScanResult } from '../analyzer/types';
import type { ChangedModule, ScanDiff } from './types';

// module id = project-relative path; cycle id = sorted member set.
// module "changed" only when kind/loc/language differ. no edge-level diff.
export function diffScans(prev: ScanResult, next: ScanResult): ScanDiff {
  const prevModulesById = new Map(prev.modules.map((m) => [m.id, m]));
  const nextModulesById = new Map(next.modules.map((m) => [m.id, m]));

  const addedModules = next.modules.filter((m) => !prevModulesById.has(m.id));
  const removedModules = prev.modules.filter((m) => !nextModulesById.has(m.id));

  const changedModules: ChangedModule[] = [];
  for (const m of next.modules) {
    const before = prevModulesById.get(m.id);
    if (!before) continue;
    if (before.kind !== m.kind || before.loc !== m.loc || before.language !== m.language) {
      changedModules.push({
        id: m.id,
        prev: { kind: before.kind, loc: before.loc, language: before.language },
        next: { kind: m.kind, loc: m.loc, language: m.language },
      });
    }
  }

  const prevCyclesByKey = new Map(prev.cycles.map((c) => [canonicalCycleKey(c), c]));
  const nextCyclesByKey = new Map(next.cycles.map((c) => [canonicalCycleKey(c), c]));

  const newCycles: Cycle[] = [];
  for (const [key, cycle] of nextCyclesByKey) {
    if (!prevCyclesByKey.has(key)) newCycles.push(cycle);
  }
  const resolvedCycles: Cycle[] = [];
  for (const [key, cycle] of prevCyclesByKey) {
    if (!nextCyclesByKey.has(key)) resolvedCycles.push(cycle);
  }

  const prevLayerByEdge = new Map(prev.layerViolations.map((v) => [v.edgeId, v]));
  const nextLayerByEdge = new Map(next.layerViolations.map((v) => [v.edgeId, v]));

  const newLayerViolations: LayerViolation[] = [];
  for (const [edgeId, v] of nextLayerByEdge) {
    if (!prevLayerByEdge.has(edgeId)) newLayerViolations.push(v);
  }
  const resolvedLayerViolations: LayerViolation[] = [];
  for (const [edgeId, v] of prevLayerByEdge) {
    if (!nextLayerByEdge.has(edgeId)) resolvedLayerViolations.push(v);
  }

  const prevContractById = new Map(prev.contractViolations.map((v) => [v.id, v]));
  const nextContractById = new Map(next.contractViolations.map((v) => [v.id, v]));

  const newContractViolations: ContractViolation[] = [];
  for (const [id, v] of nextContractById) {
    if (!prevContractById.has(id)) newContractViolations.push(v);
  }
  const resolvedContractViolations: ContractViolation[] = [];
  for (const [id, v] of prevContractById) {
    if (!nextContractById.has(id)) resolvedContractViolations.push(v);
  }

  return {
    projectId: next.project.id,
    projectName: next.project.name,
    prevScannedAt: prev.scannedAt,
    nextScannedAt: next.scannedAt,
    addedModules,
    removedModules,
    changedModules,
    newCycles,
    resolvedCycles,
    newLayerViolations,
    resolvedLayerViolations,
    newContractViolations,
    resolvedContractViolations,
    summary: {
      addedModules: addedModules.length,
      removedModules: removedModules.length,
      changedModules: changedModules.length,
      newCycles: newCycles.length,
      resolvedCycles: resolvedCycles.length,
      newLayerViolations: newLayerViolations.length,
      newContractViolations: newContractViolations.length,
    },
  };
}

/** Stable, order-independent identifier for a cycle's member set. */
function canonicalCycleKey(cycle: Cycle): string {
  return [...cycle.modules].sort().join('\u0001');
}
