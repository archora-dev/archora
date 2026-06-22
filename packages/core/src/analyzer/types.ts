export type ModuleId = string;

export type ModuleKind =
  | 'api'
  | 'component'
  | 'composable'
  | 'config'
  | 'store'
  | 'route'
  | 'model'
  | 'module'
  | 'schema'
  | 'service'
  | 'style'
  | 'test'
  | 'util'
  | 'entry'
  | 'integration'
  /** @deprecated kept for old scan JSON compatibility; new scans use `module`. */
  | 'unknown';

export type ModuleLanguage = 'ts' | 'js' | 'vue' | 'svelte';

export type EdgeKind = 'static' | 'dynamic' | 'type-only' | 'side-effect' | 'auto-import';
export type FactConfidence = 'high' | 'medium' | 'low';
export type ImportResolutionKind =
  | 'literal'
  | 'dynamic-literal'
  | 'glob'
  | 'prefix'
  | 'framework-auto'
  | 'asset'
  | 'external';

export type DetectedFramework =
  | 'vue'
  | 'react'
  | 'svelte'
  | 'nuxt'
  | 'next'
  | 'generic'
  /** @deprecated kept for old scan JSON compatibility; new scans use `generic`. */
  | 'unknown';

export interface ProjectRef {
  id: string;
  name: string;
  rootPath: string;
  detectedFramework: DetectedFramework;
  tsconfigPath?: string;
}

export interface ModuleNode {
  id: ModuleId;
  absPath: string;
  kind: ModuleKind;
  language: ModuleLanguage;
  loc: number;
  exports: string[];
  isInfra: boolean;
  /**
   * Server/client/shared classification (RSC).
   * Inferred from `'use server'` / `'use client'` directives plus framework
   * conventions (Next app/, Nuxt server/, SvelteKit `+server.ts`/`*.server.ts`).
   * Defaults to `'shared'` when nothing pins it down.
   */
  runtime?: ModuleRuntime;
  /**
   * Module is server because of a `'use server'` directive — a Next.js Server
   * Actions module, designed to be imported and called from client components
   * (Next compiles the exports into RPC references; nothing server-only ships).
   * A client->server-actions edge is the intended pattern and is NOT an
   * `rsc-leak`, unlike client->server-only (`server-only` package / server
   * component / endpoint conventions). Set only when `'use server'` is the
   * classification reason.
   */
  isServerActions?: boolean;
  isGenerated?: boolean;
  /**
   * Re-export barrel (e.g. `index.ts` re-exporting every sibling). High fan-out
   * is its purpose, not a risk — so barrels are excluded from hot zones and
   * "split this module" advice. Detected post-graph, where parsed export facts
   * and the fan-out metric are both available.
   */
  isBarrel?: boolean;
}

export type ModuleRuntime = 'server' | 'client' | 'shared';

export interface DependencyEdge {
  from: ModuleId;
  to: ModuleId;
  kind: EdgeKind;
  specifier: string;
  resolved: boolean;
  confidence?: FactConfidence;
  resolutionKind?: ImportResolutionKind;
  approximate?: boolean;
}

export interface CycleBreakpoint {
  from: ModuleId;
  to: ModuleId;
}

export interface Cycle {
  // `cycle:<hex8>` content-addressed over the sorted member list. Stable
  // across module insertion order; safe as a dictionary key and baseline
  // marker.
  id: string;
  modules: ModuleId[];
  length: number;
  severity: 'direct' | 'indirect';
  // Edge picked from the feedback arc set as the cheapest break point.
  // Absent for SCCs with no recoverable internal edges.
  suggestedBreakpoint?: CycleBreakpoint;
}

export interface ModuleMetrics {
  fanIn: number;
  fanOut: number;
  instability: number;
  depth: number;
  inCycle: boolean;
  couplingScore: number;
  hotnessScore: number;
}

export interface AnalyzerWarning {
  code:
    | 'parse-failed'
    | 'resolve-failed'
    | 'self-import'
    | 'tsconfig-missing'
    | 'unsupported-extension';
  message: string;
  file?: string;
  detail?: string;
}

// Forward import-as-type so `ScanResult` below can use `ContractViolation`.
// We re-export at the bottom so consumers can `import type { ContractViolation } from '@archora/core'`.
import type { ContractViolation as _ContractViolation } from './contracts';
import type { BundleReport as _BundleReport } from './bundle/types';
import type { ConfigDiagnostic as _ConfigDiagnostic } from '../config/frontScopeConfig';
import type {
  ChurnByModule as _ChurnByModule,
  GitHistory as _GitHistory,
  TemporalCoupling as _TemporalCoupling,
} from '../git/types';

export interface ScanResult {
  project: ProjectRef;
  modules: ModuleNode[];
  edges: DependencyEdge[];
  cycles: Cycle[];
  metrics: Record<ModuleId, ModuleMetrics>;
  hotZones: ModuleId[];
  layerViolations: LayerViolation[];
  archDebt: ArchDebt;
  recommendations: Recommendation[];
  /**
   * Trust layer. Signals are evidence-backed compatibility output
   * derived from analyzer facts and legacy recommendations. The legacy
   * `recommendations` array remains the UI/CLI compatibility projection.
   */
  signals?: ArchitectureSignal[];
  insights?: ArchitectureInsight[];
  /**
   * Parser fact summaries. This is an additive compatibility layer:
   * legacy ParsedFile/RawImport still drive graph construction, while these
   * facts expose confidence/limitations for future signals.
   */
  parserFacts?: ParsedFileSummary[];
  /**
   * Violations of user-declared architectural contracts (boundaries / budgets
   * / api-stability). Empty when no `contracts` block is defined in
   * `.archora.json`.
   */
  contractViolations: _ContractViolation[];
  /**
   * First-class `.archora.json` setup diagnostics. Invalid config is still
   * soft-failed into defaults, but callers can show the dropped fields and
   * parse errors as fixable setup issues.
   */
  configDiagnostics?: _ConfigDiagnostic[];
  /**
   * Human-facing rules config state. `not-configured` is not an error: it means
   * the scan used built-in defaults and no project rules file was found.
   */
  configStatus?: {
    state: 'not-configured' | 'loaded' | 'invalid';
    file: string | null;
  };
  /**
   * Bundle-aware analysis. Populated only when the caller supplied
   * a parsed bundler stats payload via `AnalyzeOptions.bundleStats`.
   */
  bundle?: _BundleReport;
  /**
   * Per-module churn. Populated only when the caller supplied
   * `AnalyzeOptions.gitHistory`. Modules with zero touches in the history
   * window are absent from the map.
   */
  churn?: _ChurnByModule;
  /**
   * The git history that was used to compute `churn`. Echoed back so
   * consumers (UI, reports) can show window/commit-count metadata without
   * re-running git.
   */
  gitHistory?: _GitHistory;
  /**
   * Top temporally coupled module pairs. Sorted: hidden
   * couplings first, then by score desc. Capped at `maxPairs` (default 100).
   */
  temporalCoupling?: _TemporalCoupling[];
  /**
   * Static browser memory-risk heuristics. These findings identify cleanup
   * patterns worth reviewing; they are not runtime leak proof.
   */
  memoryRisks?: MemoryRiskFinding[];
  /**
   * Static async lifecycle heuristics. These findings identify async work
   * that can outlive component lifecycle without an abort or stale guard.
   */
  asyncLifecycleRisks?: AsyncLifecycleRiskFinding[];
  scannedAt: string;
  durationMs: number;
  warnings: AnalyzerWarning[];
}

/**
 * Re-exported here (rather than imported from `analyzer/contracts.ts`) so
 * downstream packages don't need a sub-path import - keeps `ScanResult`
 * self-contained.
 */
export type { ContractViolation } from './contracts';
export type { ConfigDiagnostic, ConfigDiagnosticSeverity } from '../config/frontScopeConfig';
export type {
  ChurnAuthor,
  ChurnByModule,
  ChurnMetric,
  GitCommit,
  GitFileChange,
  GitHistory,
  TemporalCoupling,
  TemporalCouplingThresholds,
} from '../git/types';
export type {
  BundleBloat,
  BundleBloatKind,
  BundleChunk,
  BundleChunkModule,
  BundleReport,
  BundleThresholds,
  ParsedBundleStats,
} from './bundle/types';

export interface LayerViolation {
  edgeId: string;
  from: ModuleId;
  to: ModuleId;
  fromLayer: string;
  toLayer: string;
  severity: 'error' | 'warning';
}

export interface Recommendation {
  id: string;
  kind:
    | 'split-god-module'
    | 'unused-utility'
    /** @deprecated use `cycle-break-cluster`. Kept for snapshot compatibility. */
    | 'cycle-break-candidate'
    | 'cycle-break-cluster'
    | 'type-only-candidate'
    | 'misplaced-by-layer'
    | 'isolated-cluster'
    | 'contract-violation'
    | 'bundle-bloat'
    | 'temporal-coupling';
  modules: ModuleId[];
  /**
   * Per-kind structured payload. Primitive values flow into the i18n template
   * picked by `kind`; complex values (e.g. the feedback-edge list for
   * `cycle-break-cluster`) are rendered explicitly by the UI. Storing
   * structured data here keeps the recommendation localization-agnostic.
   */
  params: Record<string, string | number | readonly CycleFeedbackEdge[]>;
  weight: number;
}

export interface CycleFeedbackEdge {
  from: ModuleId;
  to: ModuleId;
  /** Number of elementary cycles broken by removing this edge. */
  broken: number;
  /** True when the count is an estimate (large SCC, cap reached). */
  partial: boolean;
}

export interface ArchDebt {
  /** 0..100, higher = worse. Composite of cycles, layer violations, hot-zone density and avg coupling. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    cycles: number;
    layerViolations: number;
    hotZones: number;
    coupling: number;
  };
}

export interface RawImport {
  specifier: string;
  kind: EdgeKind;
  confidence?: FactConfidence;
  resolutionKind?: ImportResolutionKind;
  approximate?: boolean;
  /**
   * Match strategy for the specifier when the graph builder resolves it.
   *
   * - `literal` (default): exact specifier, resolves to a single module.
   * - `prefix`: the specifier is the static prefix of a dynamic path (e.g. the
   *   head of a template literal `` `./mfes/${name}/index` `` is `./mfes/`).
   *   The graph builder treats it as a directory and creates one edge per
   *   matching file inside. Used to recover MFE-style dynamic loaders that
   *   would otherwise produce false-positive isolated-cluster insights.
   * - `glob`: the specifier is a Vite-style `import.meta.glob(...)` pattern,
   *   resolved against the project's file list to one edge per match.
   *   Multiple patterns are emitted as multiple `RawImport` entries.
   */
  pattern?: 'literal' | 'prefix' | 'glob';
  globEager?: boolean;
  globImport?: string;
}

export interface ImportFact {
  specifier: string;
  kind: EdgeKind;
  resolutionKind: ImportResolutionKind;
  confidence: FactConfidence;
  approximate: boolean;
  isAsset?: boolean;
  globEager?: boolean;
  globImport?: string;
  negative?: boolean;
}

export interface ExportFact {
  name: string;
  kind: 'value' | 'type' | 'default' | 'namespace' | 'named' | 'unknown';
  source?: string;
  confidence: FactConfidence;
}

export interface RuntimeFact {
  runtime: ModuleRuntime;
  source: 'directive' | 'framework-convention' | 'default';
  confidence: FactConfidence;
}

export interface FrameworkFact {
  kind:
    | 'vue-template-ref'
    | 'react-lazy'
    | 'next-dynamic'
    | 'nuxt-auto-component'
    | 'nuxt-auto-composable'
    | 'sveltekit-route'
    | 'unknown';
  value: string;
  confidence: FactConfidence;
}

export interface RouteFact {
  routeKind: 'page' | 'layout' | 'api' | 'middleware' | 'server-route';
  confidence: FactConfidence;
}

export interface StateFact {
  kind: 'pinia-store' | 'unknown';
  confidence: FactConfidence;
}

export interface AssetFact {
  specifier: string;
  assetKind: 'style' | 'json' | 'image' | 'font' | 'other';
  confidence: FactConfidence;
}

export interface ParsedFileSummary {
  relPath: string;
  language: ModuleLanguage;
  loc: number;
  imports: ImportFact[];
  exports: ExportFact[];
  runtimeFacts: RuntimeFact[];
  frameworkFacts: FrameworkFact[];
  routeFacts: RouteFact[];
  stateFacts: StateFact[];
  assetFacts: AssetFact[];
  limitations: string[];
}

export interface ParsedFile {
  relPath: string;
  language: ModuleLanguage;
  loc: number;
  exports: string[];
  imports: RawImport[];
  summary?: ParsedFileSummary;
  hasDefineStore: boolean;
  /**
   * Top-of-file directive prologue (`'use server'` / `'use client'`).
   * Empty when none. Order-preserving for first-wins resolution.
   */
  directives?: ('use server' | 'use client')[];
  /** PascalCase component tags from <template>, resolved against the component registry in buildGraph. */
  templateRefs?: string[];
  /**
   * Identifiers called as a function (`foo(...)`, not `obj.foo(...)`).
   * Used to resolve Nuxt auto-import composables in buildGraph.
   */
  callIdentifiers?: string[];
}

export type SignalSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type SignalConfidence = FactConfidence;
export type SignalActionability = 'none' | 'manual' | 'guided' | 'safe-fix';
export type SignalStatus = 'new' | 'existing' | 'regressed' | 'resolved';
export type SignalMaturity = 'experimental' | 'beta' | 'stable';

export interface SignalEvidence {
  kind:
    | 'cycle'
    | 'contract'
    | 'bundle'
    | 'temporal'
    | 'memory'
    | 'async-lifecycle'
    | 'metric'
    | 'layer'
    | 'parser-fact'
    | 'heuristic';
  message: string;
  modules?: ModuleId[];
  confidence: SignalConfidence;
  source?: string;
}

export type MemoryRiskKind =
  | 'event-listener-cleanup'
  | 'timer-cleanup'
  | 'observer-cleanup'
  | 'object-url-cleanup'
  | 'subscription-cleanup';

export interface MemoryRiskEvidence {
  message: string;
  line?: number;
  acquire: string;
  expectedCleanup: string;
}

export interface MemoryRiskFinding {
  id: string;
  kind: MemoryRiskKind;
  moduleId: ModuleId;
  framework?: DetectedFramework;
  severity: 'low' | 'medium';
  confidence: FactConfidence;
  evidence: MemoryRiskEvidence[];
  remediation: string;
}

export type AsyncLifecycleRiskKind = 'async-effect-cleanup';

export interface AsyncLifecycleRiskEvidence {
  message: string;
  line?: number;
  asyncSource: string;
  expectedGuard: string;
}

export interface AsyncLifecycleRiskFinding {
  id: string;
  kind: AsyncLifecycleRiskKind;
  moduleId: ModuleId;
  framework?: DetectedFramework;
  severity: 'low' | 'medium';
  confidence: FactConfidence;
  evidence: AsyncLifecycleRiskEvidence[];
  remediation: string;
}

export interface SignalLifecycle {
  status: SignalStatus;
  firstSeenAt?: string;
  lastSeenAt?: string;
  baselineKey?: string;
}

export interface Suppression {
  stableKey: string;
  reason: string;
  scope?: 'project' | 'module' | 'rule';
  moduleId?: ModuleId;
  createdAt?: string;
  expiresAt?: string;
  status?: 'active' | 'expired' | 'stale';
}

export interface SignalRanking {
  score: number;
  reasons: string[];
  noisePenalty: number;
  noveltyBoost: number;
}

export interface ArchitectureSignal {
  id: string;
  stableKey: string;
  kind: string;
  title: string;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  actionability: SignalActionability;
  status: SignalStatus;
  maturity: SignalMaturity;
  modules: ModuleId[];
  evidence: SignalEvidence[];
  limitations: string[];
  ranking: SignalRanking;
  legacyRecommendationId?: string;
  suppressed?: boolean;
  suppressionReason?: string;
}

export interface ArchitectureInsight {
  id: string;
  title: string;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  signals: string[];
  modules: ModuleId[];
  rankingScore: number;
  summary: string;
}

export type ScanPhase = 'discover' | 'parse' | 'graph' | 'cycles' | 'metrics' | 'done';

export interface ScanProgressEvent {
  phase: ScanPhase;
  current?: number;
  total?: number;
}

export type ScanProgressCallback = (event: ScanProgressEvent) => void;
