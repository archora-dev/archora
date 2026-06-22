import type {
  AsyncLifecycleRiskFinding,
  ConfigDiagnostic,
  ContractViolation,
  Cycle,
  LayerViolation,
  MemoryRiskFinding,
  ModuleId,
  ModuleMetrics,
  TemporalCoupling,
} from '@/core/analyzer/types';

export type FindingType =
  | 'cycle'
  | 'layer-violation'
  | 'hotspot'
  | 'contract' // includes rsc-leak (a ContractViolation kind)
  | 'coupling' // temporal coupling (hidden / cross-boundary pairs)
  | 'memory' // beta heuristic
  | 'async-lifecycle' // beta heuristic
  | 'setup'; // config diagnostics

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** Localization-agnostic title: the UI renders it via t(i18nKey, params). */
export interface FindingText {
  i18nKey: string;
  params: Record<string, string | number>;
}

/** Type-tagged evidence carrying the raw source finding for the renderer registry. */
export type FindingEvidence =
  | { kind: 'cycle'; cycle: Cycle }
  | { kind: 'layer-violation'; violation: LayerViolation }
  | { kind: 'hotspot'; moduleId: ModuleId; metrics: ModuleMetrics; rank: number }
  | { kind: 'contract'; violation: ContractViolation }
  | { kind: 'coupling'; coupling: TemporalCoupling }
  | { kind: 'memory'; finding: MemoryRiskFinding }
  | { kind: 'async-lifecycle'; finding: AsyncLifecycleRiskFinding }
  | { kind: 'setup'; diagnostic: ConfigDiagnostic };

export interface Finding {
  /** Globally unique within a scan: `${type}:${sourceId}`. */
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  title: FindingText;
  modules: ModuleId[];
  /** Primary anchor for "open in context" and change-set matching. */
  location?: ModuleId;
  /** 0..100 risk where the source provides one (coupling, hotspot). */
  risk?: number;
  /** Heuristic finding (memory, async-lifecycle): never inflates the grade. */
  beta: boolean;
  /** Set by the change-set selector against a baseline diff. Default false. */
  inChangeSet: boolean;
  evidence: FindingEvidence;
}

/**
 * Above this size a cycle stops being a fixable loop and is a tangled cluster:
 * a single "cut this edge" suggestion is meaningless, so it is reframed as a
 * cluster needing decomposition. Cycles at or below keep the actionable cut-edge.
 */
export const CYCLE_TANGLE_THRESHOLD = 12;

export const FINDING_TYPES: readonly FindingType[] = [
  'cycle',
  'layer-violation',
  'hotspot',
  'contract',
  'coupling',
  'memory',
  'async-lifecycle',
  'setup',
] as const;
