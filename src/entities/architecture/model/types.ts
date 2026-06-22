import type {
  Cycle,
  DependencyEdge,
  LayerViolation,
  ModuleId,
  ModuleKind,
  ModuleMetrics,
  Recommendation,
  ScanResult,
} from '@/core/analyzer/types';

export type ArchitectureGrouping = 'area' | 'layer' | 'folder' | 'package';
export type ArchitectureTextSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface ArchitectureTextFact<K extends string = string> {
  kind: K;
  severity: ArchitectureTextSeverity;
  i18nKey: string;
  params: Record<string, string | number>;
  evidence: string[];
}

export interface ArchitectureModuleItem {
  id: ModuleId;
  label: string;
  folder: string;
  loc: number;
}

export interface ArchitectureRiskItem extends ArchitectureModuleItem {
  kind: ModuleKind;
  fanIn: number;
  fanOut: number;
  degree: number;
  cycleCount: number;
  violationCount: number;
  instability: number;
  couplingScore: number;
  hotnessScore: number;
  debtScore: number;
  riskScore: number;
}

export interface ArchitectureCycleItem {
  id: string;
  modules: ModuleId[];
  length: number;
  severity: Cycle['severity'];
  affectedFolders: string[];
  suggestedBreakPoint: { from: ModuleId; to: ModuleId } | null;
}

export interface ArchitectureViolationItem {
  id: string;
  from: ModuleId;
  to: ModuleId;
  fromLayer: string;
  toLayer: string;
  severity: LayerViolation['severity'];
  message: ArchitectureTextFact<'layer-violation'>;
}

export type ArchitectureActionKind =
  | 'fix-layer-violation'
  | 'break-cycle'
  | 'review-hotspot'
  | 'remove-orphan'
  | 'reduce-coupling';

export interface ArchitectureActionItem {
  kind: ArchitectureActionKind;
  i18nKey: string;
  params: Record<string, string | number>;
  evidence: string[];
  targetId?: string;
  count?: number;
}

export type ArchitecturePriorityIssueKind =
  | 'cycle'
  | 'layer-violation'
  | 'high-fan-out'
  | 'high-fan-in'
  | 'orphan'
  | 'unstable-module';

export interface ArchitecturePriorityIssue {
  id: string;
  kind: ArchitecturePriorityIssueKind;
  severity: 'error' | 'warning' | 'info';
  targetId: string;
  affectedModules: number;
  recommendation: ArchitectureTextFact<ArchitecturePriorityIssueKind>;
}

export interface ArchitectureFolderRisk {
  folder: string;
  layer: string;
  area: string;
  moduleCount: number;
  fanIn: number;
  fanOut: number;
  cycleCount: number;
  violationCount: number;
  riskScore: number;
}

export interface ArchitectureAreaRisk {
  area: string;
  moduleCount: number;
  fanIn: number;
  fanOut: number;
  cycleCount: number;
  violationCount: number;
  riskScore: number;
}

export interface ArchitectureLayerRisk {
  layer: string;
  moduleCount: number;
  fanIn: number;
  fanOut: number;
  cycleCount: number;
  violationCount: number;
  riskScore: number;
}

export interface ArchitectureOverview {
  totals: {
    modules: number;
    dependencies: number;
    domains: number;
    cycles: number;
    layerViolations: number;
    hotZones: number;
    orphanModules: number;
  };
  topHotspots: ArchitectureRiskItem[];
  topCycles: ArchitectureCycleItem[];
  layerViolations: ArchitectureViolationItem[];
  orphanModules: ArchitectureModuleItem[];
  priorityIssues: ArchitecturePriorityIssue[];
  areaRisks: ArchitectureAreaRisk[];
  folderRisks: ArchitectureFolderRisk[];
  layerRisks: ArchitectureLayerRisk[];
  suggestedActions: ArchitectureActionItem[];
  health: {
    debtScore: number;
    grade: string;
  };
}

export interface DependencyMatrixOptions {
  grouping: ArchitectureGrouping;
  violationOnly?: boolean;
}

export interface DependencyMatrixImport {
  from: ModuleId;
  to: ModuleId;
  kind: DependencyEdge['kind'];
  specifier: string;
  violation: LayerViolation | null;
  cycleEdge: boolean;
}

export interface DependencyMatrixCell {
  from: string;
  to: string;
  count: number;
  violationCount: number;
  severity: 'normal' | 'warning' | 'error';
  imports: DependencyMatrixImport[];
}

export interface DependencyMatrix {
  grouping: ArchitectureGrouping;
  groups: string[];
  cells: DependencyMatrixCell[];
}

export interface FolderExplorerOptions {
  depth?: number;
  search?: string;
  layer?: string;
  onlyCycles?: boolean;
  onlyViolations?: boolean;
  onlyHotZones?: boolean;
  onlyMemoryRisks?: boolean;
  onlyAsyncLifecycleRisks?: boolean;
  onlyOrphaned?: boolean;
  onlyHighFanOut?: boolean;
  onlyHighFanIn?: boolean;
  sortBy?:
    | 'path'
    | 'fileCount'
    | 'imports'
    | 'importedBy'
    | 'fanIn'
    | 'fanOut'
    | 'cycles'
    | 'violations'
    | 'riskScore';
  sortDirection?: 'asc' | 'desc';
}

export type FolderTopFile = ArchitectureRiskItem;

export interface FolderModuleRows {
  items: ArchitectureRiskItem[];
  totalCount: number;
  visibleCount: number;
}

export interface FolderExplorerItem {
  id: string;
  label: string;
  type: 'folder';
  layer: string;
  depth: number;
  fileCount: number;
  outgoingDeps: number;
  incomingDeps: number;
  cycleCount: number;
  violationCount: number;
  memoryRiskCount: number;
  asyncLifecycleRiskCount: number;
  fanIn: number;
  fanOut: number;
  riskScore: number;
  isOrphaned: boolean;
  hasHotModule: boolean;
  /** True when every module in the folder matches `analysis.generated`. */
  isGenerated: boolean;
  badges: string[];
  topFiles: FolderTopFile[];
}

export interface FolderExplorer {
  items: FolderExplorerItem[];
  totalCount: number;
  filteredCount: number;
}

export type ExplorerRiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ExplorerRiskFactorId =
  | 'cycles'
  | 'violations'
  | 'fan-out'
  | 'fan-in'
  | 'coupling'
  | 'dependence'
  | 'size';

export interface ExplorerRiskFactor {
  id: ExplorerRiskFactorId;
  value: string | number;
  severity: ExplorerRiskSeverity;
  valueType: 'number' | 'badge';
}

export interface ExplorerInspectorSummary {
  loc: number;
  fanIn: number;
  fanOut: number;
  couplingScore: number;
  dependenceScore: number;
  incomingDeps: number;
  outgoingDeps: number;
  cycleCount: number;
  violationCount: number;
  riskScore: number;
  badges: string[];
  riskFactors: ExplorerRiskFactor[];
  whyRisk: string;
}

export interface ExplorerInspectorImportEvidence {
  sourcePath: ModuleId;
  targetPath: ModuleId;
  specifier: string;
  resolved: boolean;
  confidence: DependencyEdge['confidence'];
  resolutionKind: DependencyEdge['resolutionKind'];
  approximate: DependencyEdge['approximate'];
}

export interface ExplorerInspectorImport {
  from: ModuleId;
  to: ModuleId;
  count: number;
  kind: DependencyEdge['kind'];
  specifier: string;
  sourceLayer: string;
  targetLayer: string;
  crossLayer: boolean;
  violation: LayerViolation | null;
  evidence: ExplorerInspectorImportEvidence[];
}

export interface ExplorerInspectorImports {
  outgoing: ExplorerInspectorImport[];
  incoming: ExplorerInspectorImport[];
  bothDirections: ExplorerInspectorImport[];
  outgoingCount: number;
  incomingCount: number;
  uniqueModuleCount: number;
  uniqueModules: number;
}

export interface ExplorerInspectorCycleSummary {
  cycleCount: number;
  relatedModuleCount: number;
  violationCount: number;
  hotZoneCount: number;
  importTypeCandidateCount: number;
}

export interface ExplorerInspectorCycles {
  items: CycleViewItem[];
  primaryCycle: CycleViewItem | null;
  summary: ExplorerInspectorCycleSummary;
}

export interface ExplorerInspectorViolation {
  ruleId: string;
  kind: ArchitectureRuleViolationItem['kind'];
  ruleName: string;
  severity: ArchitectureRuleViolationItem['severity'];
  riskScore: number;
  from: ModuleId;
  to: ModuleId;
  fromLayer: string;
  toLayer: string;
  importPath: string;
  whatHappenedKey: 'layerBoundaryCrossed' | 'contractViolation';
  whyBadKey: 'layerDirection' | 'contractRule';
  howToFixKey: 'moveDependency' | 'enforceContract';
  messageParams: Record<string, string | number>;
  relatedCycles: string[];
}

export interface ExplorerInspectorViolationSummary {
  totalCount: number;
  criticalCount: number;
  warningCount: number;
}

export interface ExplorerInspectorImpactItem {
  id: ModuleId;
  relation: 'import' | 'imported-by' | 'transitive';
  distance: number;
  riskScore: number;
  layer: string;
  via: ModuleId[];
}

export interface ExplorerInspectorImpact {
  affectedModulesCount: number;
  affectedFilesCount: number;
  affectedLayersCount: number;
  changeRiskScore: number;
  changeRiskSeverity: ExplorerRiskSeverity;
  directCount: number;
  transitiveCount: number;
  items: ExplorerInspectorImpactItem[];
  incomingImporters: ExplorerInspectorImpactItem[];
  outgoingImports: ExplorerInspectorImpactItem[];
  riskyAffectedModules: ExplorerInspectorImpactItem[];
  primaryAction: ImpactAction;
  recommendations: Array<'reviewTransitive' | 'reviewHighRisk'>;
}

export interface ExplorerInspectorRecommendation {
  key:
    | 'breakCycle'
    | 'moveDependency'
    | 'splitModule'
    | 'stabilizeApi'
    | 'reviewOrphan'
    | 'keepBoundary';
  source: 'cycle' | 'violation' | 'fan-out' | 'fan-in' | 'orphan' | 'baseline';
  targetId?: string;
  count?: number;
}

export interface ExplorerInspectorData {
  summary: ExplorerInspectorSummary;
  imports: ExplorerInspectorImports;
  cycles: ExplorerInspectorCycles;
  violations: {
    items: ExplorerInspectorViolation[];
    summary: ExplorerInspectorViolationSummary;
  };
  impact: ExplorerInspectorImpact;
  recommendations: ExplorerInspectorRecommendation[];
}

export interface ImpactTarget {
  id: string;
  kind: 'module' | 'folder' | 'layer' | 'area';
  moduleCount: number;
}

export interface ImpactSummary {
  target: ImpactTarget;
  importers: ArchitectureModuleItem[];
  imports: ArchitectureModuleItem[];
  affectedModules: ArchitectureModuleItem[];
  affectedAreas: string[];
  affectedFolders: string[];
  affectedCycles: ArchitectureCycleItem[];
  affectedViolations: ArchitectureViolationItem[];
  summary: ArchitectureTextFact<'impact-summary'>;
}

export interface CycleViewModelOptions {
  search?: string;
  onlyDirect?: boolean;
  onlyIndirect?: boolean;
  onlyCrossLayer?: boolean;
  onlyCrossFolder?: boolean;
  onlyInvolvingHotZones?: boolean;
  onlyInvolvingLayerViolations?: boolean;
  onlyInvolvingContractViolations?: boolean;
  onlyHighRisk?: boolean;
  sortBy?: 'risk' | 'length' | 'affectedModules' | 'impact' | 'folder' | 'layer' | 'kind';
  groupBy?: 'none' | 'folder' | 'layer' | 'risk' | 'size' | 'kind';
  selectedCycleId?: string;
}

export interface CycleEdgeItem {
  from: ModuleId;
  to: ModuleId;
  kind: DependencyEdge['kind'];
  specifier: string;
  fromLayer: string;
  toLayer: string;
  fromFolder: string;
  toFolder: string;
  crossesLayer: boolean;
  violatesBoundary: boolean;
}

export interface CycleBreakSuggestion {
  sourceId: ModuleId;
  targetId: ModuleId;
  reasonKind:
    | 'cross-layer'
    | 'rule-violation'
    | 'type-only-candidate'
    | 'low-import-count'
    | 'layer-inversion';
  impact: 'low' | 'medium' | 'high';
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
  edge: CycleEdgeItem;
}

export interface CycleGroup {
  id: string;
  label: string;
  count: number;
  riskScore: number;
}

export interface CycleViewItem extends ArchitectureCycleItem {
  affectedAreas: string[];
  affectedLayers: string[];
  riskScore: number;
  fanInImpact: number;
  fanOutImpact: number;
  edges: CycleEdgeItem[];
  relatedHotZones: ArchitectureRiskItem[];
  relatedLayerViolations: ArchitectureViolationItem[];
  relatedContractViolations: ArchitectureRuleViolationItem[];
  suggestedBreakpoints: CycleBreakSuggestion[];
  importTypeCandidates: CycleEdgeItem[];
}

export interface CyclesViewModel {
  items: CycleViewItem[];
  groups: CycleGroup[];
  selectedCycle: CycleViewItem | null;
  totalCount: number;
  filteredCount: number;
}

export interface ImpactViewModelOptions {
  targetKind?: 'module' | 'folder' | 'layer' | 'area';
  direction?: 'dependencies' | 'dependents' | 'both';
  depth?: 0 | 1 | 2 | 3;
  groupBy?: 'none' | 'area' | 'folder' | 'layer' | 'kind' | 'distance';
  sortBy?: 'distance' | 'risk' | 'fanIn' | 'fanOut' | 'path' | 'area' | 'folder' | 'layer';
}

export interface ImpactViewItem extends ArchitectureRiskItem {
  direction: 'dependency' | 'dependent';
  distance: number;
  via: ModuleId[];
}

export interface ImpactAction {
  key: ExplorerInspectorRecommendation['key'];
  reason: 'high-fan-in' | 'high-fan-out' | 'cycles-touched' | 'violations-touched' | 'low-risk';
  count: number;
  evidence: string[];
}

export interface ImpactGroup {
  id: string;
  label: string;
  count: number;
  riskScore: number;
}

export interface ImpactViewModel {
  empty: boolean;
  target: ImpactTarget | null;
  direction: NonNullable<ImpactViewModelOptions['direction']>;
  depth: NonNullable<ImpactViewModelOptions['depth']>;
  items: ImpactViewItem[];
  groups: ImpactGroup[];
  incomingImporters: ImpactViewItem[];
  outgoingImports: ImpactViewItem[];
  riskyAffectedModules: ImpactViewItem[];
  primaryAction: ImpactAction;
  summary: {
    affectedModulesCount: number;
    affectedAreasCount: number;
    affectedFoldersCount: number;
    affectedLayersCount: number;
    riskyAffectedModulesCount: number;
    cyclesTouched: number;
    violationsTouched: number;
    hotZonesTouched: number;
    directCount: number;
    transitiveCount: number;
  };
}

export interface RulesViewModelOptions {
  search?: string;
  kinds?: Array<'layer' | 'contract'>;
  severities?: Array<'warning' | 'error' | 'critical'>;
  sourceLayer?: string;
  targetLayer?: string;
  onlyRelatedToCycles?: boolean;
  onlyRelatedToHotZones?: boolean;
  sortBy?: 'risk' | 'violations' | 'source' | 'target' | 'rule' | 'modulePath';
  groupBy?: 'none' | 'rule' | 'sourceLayer' | 'targetLayer' | 'folder' | 'severity';
  selectedViolationId?: string;
}

export interface ArchitectureRuleViolationItem {
  id: string;
  kind: 'layer' | 'contract';
  ruleName: string;
  severity: 'warning' | 'error' | 'critical';
  sourceModule: ModuleId;
  targetModule: ModuleId;
  sourceLayer: string;
  targetLayer: string;
  importPath: string;
  explanation: ArchitectureTextFact<'layer-rule' | 'contract-rule'>;
  howToFix: ArchitectureTextFact<'move-dependency' | 'enforce-contract'>;
  riskScore: number;
  relatedCycles: string[];
  relatedHotZones: ModuleId[];
  relatedRecommendation: Recommendation | null;
}

export interface RuleViolationGroup {
  id: string;
  label: string;
  count: number;
  riskScore: number;
}

export interface RulesViewModel {
  items: ArchitectureRuleViolationItem[];
  groups: RuleViolationGroup[];
  selectedViolation: ArchitectureRuleViolationItem | null;
  totalCount: number;
  filteredCount: number;
}

export interface ModuleRiskContext {
  cycleCountByModule: Map<ModuleId, number>;
  violationCountByModule: Map<ModuleId, number>;
  metricsByModule: Record<ModuleId, ModuleMetrics>;
  hotZoneIds: ReadonlySet<ModuleId>;
}

export interface ArchitectureViewContext {
  risk: ModuleRiskContext;
  modulesById: ReadonlyMap<ModuleId, ScanResult['modules'][number]>;
  incomingByModule: ReadonlyMap<ModuleId, readonly ModuleId[]>;
  outgoingByModule: ReadonlyMap<ModuleId, readonly ModuleId[]>;
  cyclesByModule: ReadonlyMap<ModuleId, readonly string[]>;
  cycleOrder: ReadonlyMap<string, number>;
  hotZoneIds: ReadonlySet<ModuleId>;
  recommendationsByModule: ReadonlyMap<ModuleId, readonly Recommendation[]>;
  recommendationOrder: ReadonlyMap<string, number>;
}
