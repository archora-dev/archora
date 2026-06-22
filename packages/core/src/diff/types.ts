import type {
  ContractViolation,
  Cycle,
  LayerViolation,
  ModuleId,
  ModuleNode,
} from '../analyzer/types';

export interface ScanDiff {
  /** Project id and name from the *current* (newer) scan, for display. */
  projectId: string;
  projectName: string;
  /** ISO timestamps of the compared scans. */
  prevScannedAt: string;
  nextScannedAt: string;

  /** Modules that exist in `next` but not in `prev`. */
  addedModules: ModuleNode[];
  /** Modules that existed in `prev` but were dropped in `next`. */
  removedModules: ModuleNode[];
  /** Modules whose `kind`, `loc` or `language` changed. */
  changedModules: ChangedModule[];

  /** Cycles that did not appear in `prev` (matched by sorted module-id set). */
  newCycles: Cycle[];
  /** Cycles that disappeared in `next`. */
  resolvedCycles: Cycle[];

  /** Layer violations whose `edgeId` is absent from `prev`. */
  newLayerViolations: LayerViolation[];
  /** Layer violations whose `edgeId` was present in `prev` but not in `next`. */
  resolvedLayerViolations: LayerViolation[];

  /** Contract violations whose `id` is absent from `prev`. */
  newContractViolations: ContractViolation[];
  /** Contract violations whose `id` was present in `prev` but not in `next`. */
  resolvedContractViolations: ContractViolation[];

  /** Aggregate counts for quick rendering at the top of a diff view. */
  summary: ScanDiffSummary;
}

export interface ChangedModule {
  id: ModuleId;
  prev: { kind: ModuleNode['kind']; loc: number; language: ModuleNode['language'] };
  next: { kind: ModuleNode['kind']; loc: number; language: ModuleNode['language'] };
}

export interface ScanDiffSummary {
  addedModules: number;
  removedModules: number;
  changedModules: number;
  newCycles: number;
  resolvedCycles: number;
  newLayerViolations: number;
  newContractViolations: number;
}
