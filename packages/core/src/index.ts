export { analyze, type AnalyzeOptions, type FileSource } from './analyzer/index';
export {
  buildArchitectureSignals,
  applySignalSuppressions,
  canSignalFailCi,
  projectSignalsToRecommendations,
  reconcileSignalLifecycle,
  type ApplySignalSuppressionsResult,
  type BuildArchitectureSignalsInput,
  type BuildArchitectureSignalsResult,
  type CanSignalFailCiOptions,
  type ReconcileSignalLifecycleResult,
} from './analyzer/index';
// NOTE: cache module is intentionally NOT re-exported from this barrel.
// `cache/index.ts` imports `node:crypto` / `node:fs` / `node:v8` / `node:os`
// at the top level - including it here would force Vite to externalize those
// for browser builds and throw at runtime as soon as anything in the front-end
// touches `@/core` (barrel imports cascade into every re-export, even unused
// ones). Node-side consumers (CLI, scripts) import directly from
// `@archora/core/cache` via the package's `exports` map.
export type * from './analyzer/types';
export {
  buildJsonReport,
  type ReportEnvelope,
  type BuildReportOptions,
} from './report/buildJsonReport';
export {
  buildFixPlan,
  type FixPlanReport,
  type FixPlanFinding,
  type FixPlanRepairGroup,
  type BuildFixPlanOptions,
} from './report/buildFixPlan';
export {
  buildDeadCodeReport,
  type DeadCodeReport,
  type DeadCodeCandidate,
} from './report/buildDeadCodeReport';
export { diffScans, type ScanDiff, type ChangedModule, type ScanDiffSummary } from './diff/index';
export { compileGlob } from './analyzer/discover';
export {
  loadArchoraConfig,
  loadArchoraConfigWithDiagnostics,
  resolveGeneratedPatterns,
  GENERATED_PRESETS,
  type ArchoraConfig,
  type ConfigDiagnostic,
  type ConfigDiagnosticSeverity,
  type LoadArchoraConfigResult,
  type DynamicLoaderConfig,
  type AnalysisConfig,
  type ArchitectureBudgetConfig,
  type GeneratedPolicy,
  type GeneratedPreset,
} from './config/frontScopeConfig';
export {
  detectLayer,
  detectLayerViolations,
  recomputeLayers,
  validateLayerOverride,
  LAYER_ORDER,
  type Layer,
  type LayerOverrides,
  type LayerOverrideError,
  type RecomputeLayersInput,
  type RecomputeLayersOutput,
} from './analyzer/layers';
export {
  search,
  parseQuery,
  isEmpty as isEmptyQuery,
  type SearchResult,
  type SearchOptions,
  type MatchKind,
  type SearchPrefix,
  type ParsedQuery,
} from './search/index';
export {
  suggestContracts,
  type SuggestContractsInput,
  type SuggestedContracts,
} from './analyzer/suggestContracts';
// Git history. Same pattern as `cache`: the Node-only
// `readGitHistory` lives in `./git/readGitHistory` and must NOT be
// re-exported from this barrel (it imports `node:child_process` and would
// break browser bundles). Pure helpers are safe — they import only types.
export { parseGitLog, expandRename } from './git/parseGitLog';
export { computeChurn, type ComputeChurnInput } from './git/computeChurn';
export {
  computeTemporalCoupling,
  type ComputeTemporalCouplingInput,
} from './git/computeTemporalCoupling';
export {
  buildGeneratedConfigSnippet,
  buildIgnoreSnippet,
  buildLayerOverrideSnippet,
  buildDynamicLoaderSnippet,
  buildProjectPolicyPresetSnippet,
  type ProjectPolicyPreset,
} from './codegen/configSnippets';
export {
  buildInitialArchoraConfig,
  buildInitialArchoraConfigJson,
  type BuildInitialArchoraConfigInput,
  type InitialArchoraConfigResult,
  type InitialArchoraDetection,
} from './codegen/initConfig';
export {
  buildExplainView,
  buildImpactView,
  buildLifecycleHygieneView,
  buildMatrixView,
  buildOwnershipView,
  buildReviewRiskView,
  buildSemanticSurfaceView,
  buildSignalBaselineView,
  buildTrendView,
  countBaselineSignals,
  findModuleMatches,
  resolveImpactTarget,
  type BuildMatrixViewOptions,
  type GuidedReviewAction,
  type ExplainCycleDetails,
  type ExplainCycleEdge,
  type ExplainView,
  type ImpactView,
  type LifecycleHygieneItem,
  type LifecycleHygieneView,
  type LifecycleRiskModule,
  type MatrixCell,
  type MatrixEdge,
  type MatrixGrouping,
  type MatrixView,
  type OwnershipArea,
  type OwnershipView,
  type ReviewRiskView,
  type SemanticSurfaceModule,
  type SemanticSurfaceView,
  type SideEffectOwner,
  type SignalBaselineView,
  type TrendView,
} from './views/analyzerViews';
