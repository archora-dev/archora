import type {
  AnalyzerWarning,
  AsyncLifecycleRiskFinding,
  ArchitectureInsight,
  ArchitectureSignal,
  ModuleId,
  MemoryRiskFinding,
  ParsedFileSummary,
  Recommendation,
  SignalActionability,
  SignalConfidence,
  SignalEvidence,
  SignalMaturity,
  SignalSeverity,
  Suppression,
} from './types';

export interface BuildArchitectureSignalsInput {
  recommendations: readonly Recommendation[];
  warnings: readonly AnalyzerWarning[];
  parserFacts?: readonly ParsedFileSummary[];
  insightLimit?: number;
  minInsightSeverity?: SignalSeverity;
  minInsightConfidence?: SignalConfidence;
  memoryRisks?: readonly MemoryRiskFinding[];
  asyncLifecycleRisks?: readonly AsyncLifecycleRiskFinding[];
}

export interface BuildArchitectureSignalsResult {
  signals: ArchitectureSignal[];
  insights: ArchitectureInsight[];
}

const TOP_INSIGHTS = 8;
const DEFAULT_CI_MIN_SEVERITY: SignalSeverity = 'high';
const SEVERITY_RANK: Record<SignalSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function buildArchitectureSignals(
  input: BuildArchitectureSignalsInput,
): BuildArchitectureSignalsResult {
  const parserQuality = buildParserQualityIndex(input.parserFacts ?? []);
  const signals = input.recommendations.map((rec) => signalFromRecommendation(rec, parserQuality));
  for (const warning of input.warnings) {
    if (warning.code !== 'resolve-failed') continue;
    signals.push(signalFromWarning(warning));
  }
  for (const risk of input.memoryRisks ?? []) {
    signals.push(signalFromMemoryRisk(risk));
  }
  for (const risk of input.asyncLifecycleRisks ?? []) {
    signals.push(signalFromAsyncLifecycleRisk(risk));
  }
  const ranked = [...signals].sort((a, b) => b.ranking.score - a.ranking.score);
  const insightOptions: InsightOptions = {};
  if (input.insightLimit !== undefined) insightOptions.limit = input.insightLimit;
  if (input.minInsightSeverity) insightOptions.minSeverity = input.minInsightSeverity;
  if (input.minInsightConfidence) insightOptions.minConfidence = input.minInsightConfidence;
  const insights = buildInsights(ranked, insightOptions);
  return { signals, insights };
}

export interface CanSignalFailCiOptions {
  minSeverity?: SignalSeverity;
  includeBeta?: boolean;
  includeExperimental?: boolean;
}

export interface ReconcileSignalLifecycleResult {
  current: ArchitectureSignal[];
  resolved: ArchitectureSignal[];
}

export interface ApplySignalSuppressionsResult {
  signals: ArchitectureSignal[];
  staleSuppressions: Suppression[];
}

export function projectSignalsToRecommendations(
  signals: readonly ArchitectureSignal[],
  existing: readonly Recommendation[] = [],
): Recommendation[] {
  const existingIds = new Set(existing.map((item) => item.id));
  const projected: Recommendation[] = [];
  for (const signal of signals) {
    if (signal.legacyRecommendationId) continue;
    const kind = recommendationKindForSignal(signal);
    if (!kind) continue;
    const id = `signal:${signal.stableKey}`;
    if (existingIds.has(id)) continue;
    projected.push({
      id,
      kind,
      modules: signal.modules,
      params: {
        signal: signal.title,
        severity: signal.severity,
        stableKey: signal.stableKey,
      },
      weight: signal.ranking.score / 100,
    });
  }
  return [...existing, ...projected];
}

export function canSignalFailCi(
  signal: ArchitectureSignal,
  options: CanSignalFailCiOptions = {},
): boolean {
  if (signal.suppressed) return false;
  if (signal.status === 'resolved') return false;
  if (signal.confidence !== 'high') return false;
  if (!severityAtLeast(signal.severity, options.minSeverity ?? DEFAULT_CI_MIN_SEVERITY)) {
    return false;
  }
  if (signal.maturity === 'stable') return true;
  if (signal.maturity === 'beta') return options.includeBeta === true;
  return options.includeExperimental === true;
}

export function reconcileSignalLifecycle(
  previous: readonly ArchitectureSignal[],
  current: readonly ArchitectureSignal[],
): ReconcileSignalLifecycleResult {
  const previousByKey = new Map(previous.map((signal) => [signal.stableKey, signal]));
  const currentKeys = new Set(current.map((signal) => signal.stableKey));
  const reconciled = current.map((signal): ArchitectureSignal => {
    const prior = previousByKey.get(signal.stableKey);
    if (!prior) return { ...signal, status: 'new' };
    return {
      ...signal,
      status: isSignalRegression(prior, signal) ? 'regressed' : 'existing',
    };
  });
  const resolved = previous
    .filter((signal) => !currentKeys.has(signal.stableKey))
    .map((signal): ArchitectureSignal => ({ ...signal, status: 'resolved' }));
  return { current: reconciled, resolved };
}

export function applySignalSuppressions(
  signals: readonly ArchitectureSignal[],
  suppressions: readonly Suppression[],
  context: { now?: Date | string } = {},
): ApplySignalSuppressionsResult {
  const nowMs = normalizeDateMs(context.now ?? new Date());
  const signalKeys = new Set(signals.map((signal) => signal.stableKey));
  const active = suppressions.filter((suppression) => !isSuppressionExpired(suppression, nowMs));
  const applied = signals.map((signal): ArchitectureSignal => {
    const suppression = active.find((candidate) => matchesSuppression(signal, candidate));
    if (!suppression) return signal;
    return {
      ...signal,
      suppressed: true,
      suppressionReason: suppression.reason,
    };
  });
  const staleSuppressions = suppressions
    .filter((suppression) => !signalKeys.has(suppression.stableKey))
    .map((suppression): Suppression => ({ ...suppression, status: 'stale' }));
  return { signals: applied, staleSuppressions };
}

function signalFromRecommendation(
  rec: Recommendation,
  parserQuality: ReadonlyMap<ModuleId, ParserQuality>,
): ArchitectureSignal {
  const classification = applyParserQuality(
    classifyRecommendation(rec),
    rec.modules,
    parserQuality,
  );
  const modules = [...rec.modules];
  const evidence: SignalEvidence[] = [
    {
      kind: classification.evidenceKind,
      message: evidenceMessage(rec),
      modules,
      confidence: classification.confidence,
      source: 'legacy-recommendation',
    },
  ];
  const limitations = classification.limitations;
  const stableKey = buildStableSignalKey({
    kind: rec.kind,
    modules,
    evidence,
    params: rec.params,
  });
  return {
    id: `signal:${rec.id}`,
    stableKey,
    kind: rec.kind,
    title: titleFor(rec),
    severity: classification.severity,
    confidence: classification.confidence,
    actionability: classification.actionability,
    status: 'new',
    maturity: classification.maturity,
    modules,
    evidence,
    limitations,
    ranking: rankSignal({
      severity: classification.severity,
      confidence: classification.confidence,
      maturity: classification.maturity,
      weight: rec.weight,
      limitations,
    }),
    legacyRecommendationId: rec.id,
  };
}

interface InsightOptions {
  limit?: number;
  minSeverity?: SignalSeverity;
  minConfidence?: SignalConfidence;
}

function recommendationKindForSignal(signal: ArchitectureSignal): Recommendation['kind'] | null {
  switch (signal.kind) {
    case 'contract-violation':
    case 'bundle-bloat':
    case 'cycle-break-candidate':
    case 'cycle-break-cluster':
    case 'type-only-candidate':
    case 'misplaced-by-layer':
    case 'temporal-coupling':
      return signal.kind;
    default:
      return null;
  }
}

function isInsightEligible(signal: ArchitectureSignal, options: InsightOptions = {}): boolean {
  if (signal.maturity === 'experimental') return false;
  if (confidenceRank(signal.confidence) < confidenceRank(options.minConfidence ?? 'medium')) {
    return false;
  }
  if (signal.actionability === 'none') return false;
  if (!severityAtLeast(signal.severity, options.minSeverity ?? 'medium')) return false;
  if (signal.evidence.length === 0) return false;
  return signal.evidence.some((evidence) => evidence.kind !== 'heuristic');
}

function buildInsights(
  ranked: readonly ArchitectureSignal[],
  options: InsightOptions,
): ArchitectureInsight[] {
  const groups = new Map<string, ArchitectureSignal[]>();
  for (const signal of ranked) {
    if (!isInsightEligible(signal, options)) continue;
    const key = rootCauseKey(signal);
    const group = groups.get(key);
    if (group) {
      group.push(signal);
    } else {
      groups.set(key, [signal]);
    }
  }

  return [...groups.entries()]
    .map(([key, group], index): ArchitectureInsight => {
      const [top] = group;
      if (!top) throw new Error(`empty signal group: ${key}`);
      const modules = normalizeList(group.flatMap((signal) => signal.modules));
      const rankingScore = group.reduce((sum, signal) => sum + signal.ranking.score, 0);
      const related = group.length > 1 ? ` (+${group.length - 1} related)` : '';
      return {
        id: `insight:${index}:${key}`,
        title: `${top.title}${related}`,
        severity: highestSeverity(group),
        confidence: lowestConfidence(group),
        signals: group.map((signal) => signal.id),
        modules,
        rankingScore,
        summary: top.evidence[0]?.message ?? top.title,
      };
    })
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, options.limit ?? TOP_INSIGHTS);
}

function rootCauseKey(signal: ArchitectureSignal): string {
  const primaryEvidence = signal.evidence.find((item) => item.kind !== 'heuristic');
  const primaryModule = signal.modules[0] ?? primaryEvidence?.modules?.[0] ?? 'project';
  return normalizeText(`module:${primaryModule}`);
}

function highestSeverity(signals: readonly ArchitectureSignal[]): SignalSeverity {
  return signals.reduce<SignalSeverity>(
    (current, signal) =>
      SEVERITY_RANK[signal.severity] > SEVERITY_RANK[current] ? signal.severity : current,
    'info',
  );
}

function lowestConfidence(signals: readonly ArchitectureSignal[]): SignalConfidence {
  return signals.reduce<SignalConfidence>(
    (current, signal) =>
      confidenceRank(signal.confidence) < confidenceRank(current) ? signal.confidence : current,
    'high',
  );
}

function signalFromWarning(warning: AnalyzerWarning): ArchitectureSignal {
  const modules = warning.file ? [warning.file] : [];
  const stableKey = stableSignalKey(`warning:${warning.code}`, modules, [
    {
      kind: 'parser-fact',
      message: warning.detail ?? warning.message,
      modules,
      confidence: 'medium',
      ...(warning.file ? { source: warning.file } : {}),
    },
  ]);
  return {
    id: `signal:${stableKey}`,
    stableKey,
    kind: `warning:${warning.code}`,
    title: warning.message,
    severity: 'low',
    confidence: 'medium',
    actionability: 'manual',
    status: 'new',
    maturity: 'beta',
    modules,
    evidence: [
      {
        kind: 'parser-fact',
        message: warning.detail ?? warning.message,
        modules,
        confidence: 'medium',
        ...(warning.file ? { source: warning.file } : {}),
      },
    ],
    limitations: [
      'warning projection is compatibility-only until suppression/baseline lifecycle lands',
    ],
    ranking: rankSignal({
      severity: 'low',
      confidence: 'medium',
      maturity: 'beta',
      weight: 1,
      limitations: [],
    }),
  };
}

function signalFromMemoryRisk(risk: MemoryRiskFinding): ArchitectureSignal {
  const modules = [risk.moduleId];
  const evidence: SignalEvidence[] = risk.evidence.map((item) => ({
    kind: 'memory',
    message: item.message,
    modules,
    confidence: risk.confidence,
    source: item.line ? `${risk.moduleId}:${item.line}` : risk.moduleId,
  }));
  const stableKey = stableSignalKey(`memory-risk:${risk.kind}`, modules, evidence);
  return {
    id: `signal:${risk.id}`,
    stableKey,
    kind: 'memory-risk',
    title: titleForMemoryRisk(risk),
    severity: risk.severity,
    confidence: risk.confidence,
    actionability: 'manual',
    status: 'new',
    maturity: 'beta',
    modules,
    evidence,
    limitations: ['static cleanup heuristic; not runtime leak proof'],
    ranking: rankSignal({
      severity: risk.severity,
      confidence: risk.confidence,
      maturity: 'beta',
      weight: risk.confidence === 'high' ? 8 : 4,
      limitations: ['static cleanup heuristic'],
    }),
  };
}

function signalFromAsyncLifecycleRisk(risk: AsyncLifecycleRiskFinding): ArchitectureSignal {
  const modules = [risk.moduleId];
  const evidence: SignalEvidence[] = risk.evidence.map((item) => ({
    kind: 'async-lifecycle',
    message: item.message,
    modules,
    confidence: risk.confidence,
    source: item.line ? `${risk.moduleId}:${item.line}` : risk.moduleId,
  }));
  const stableKey = stableSignalKey(`async-lifecycle-risk:${risk.kind}`, modules, evidence);
  return {
    id: `signal:${risk.id}`,
    stableKey,
    kind: 'async-lifecycle-risk',
    title: 'Async lifecycle cleanup risk',
    severity: risk.severity,
    confidence: risk.confidence,
    actionability: 'manual',
    status: 'new',
    maturity: 'beta',
    modules,
    evidence,
    limitations: ['static async lifecycle heuristic; not runtime proof'],
    ranking: rankSignal({
      severity: risk.severity,
      confidence: risk.confidence,
      maturity: 'beta',
      weight: risk.confidence === 'high' ? 8 : 4,
      limitations: ['static async lifecycle heuristic'],
    }),
  };
}

function classifyRecommendation(rec: Recommendation): {
  severity: SignalSeverity;
  confidence: SignalConfidence;
  actionability: SignalActionability;
  maturity: SignalMaturity;
  evidenceKind: SignalEvidence['kind'];
  limitations: string[];
} {
  switch (rec.kind) {
    case 'contract-violation':
      return {
        severity: rec.params.severity === 'error' ? 'high' : 'medium',
        confidence: 'high',
        actionability: 'manual',
        maturity: 'stable',
        evidenceKind: 'contract',
        limitations: [],
      };
    case 'bundle-bloat':
      return {
        severity: rec.params.severity === 'high' ? 'high' : 'medium',
        confidence: 'high',
        actionability: 'manual',
        maturity: 'beta',
        evidenceKind: 'bundle',
        limitations: [],
      };
    case 'cycle-break-cluster':
    case 'cycle-break-candidate':
    case 'type-only-candidate':
      return {
        severity: 'medium',
        confidence: 'high',
        actionability: rec.kind === 'type-only-candidate' ? 'guided' : 'manual',
        maturity: 'stable',
        evidenceKind: 'cycle',
        limitations: [],
      };
    case 'temporal-coupling':
      return {
        severity: 'medium',
        confidence: 'medium',
        actionability: 'manual',
        maturity: 'beta',
        evidenceKind: 'temporal',
        limitations: ['requires representative git history window'],
      };
    case 'misplaced-by-layer':
      return {
        severity: 'medium',
        confidence: 'medium',
        actionability: 'manual',
        maturity: 'beta',
        evidenceKind: 'layer',
        limitations: ['layer detection can be path-convention dependent'],
      };
    default:
      return {
        severity: 'low',
        confidence: 'low',
        actionability: 'manual',
        maturity: 'experimental',
        evidenceKind: 'heuristic',
        limitations: ['heuristic-only signal; not eligible for CI failure by default'],
      };
  }
}

type RecommendationClassification = ReturnType<typeof classifyRecommendation>;

interface ParserQuality {
  approximateImports: number;
  lowConfidenceImports: number;
  limitations: number;
}

function buildParserQualityIndex(
  parserFacts: readonly ParsedFileSummary[],
): ReadonlyMap<ModuleId, ParserQuality> {
  const index = new Map<ModuleId, ParserQuality>();
  for (const fact of parserFacts) {
    const approximateImports = fact.imports.filter((importFact) => importFact.approximate).length;
    const lowConfidenceImports = fact.imports.filter(
      (importFact) => importFact.confidence === 'low',
    ).length;
    const limitations = fact.limitations.length;
    if (approximateImports === 0 && lowConfidenceImports === 0 && limitations === 0) continue;
    index.set(fact.relPath, {
      approximateImports,
      lowConfidenceImports,
      limitations,
    });
  }
  return index;
}

function applyParserQuality(
  classification: RecommendationClassification,
  modules: readonly ModuleId[],
  parserQuality: ReadonlyMap<ModuleId, ParserQuality>,
): RecommendationClassification {
  const impacted = modules
    .map((moduleId) => parserQuality.get(moduleId))
    .filter((quality): quality is ParserQuality => quality !== undefined);
  if (impacted.length === 0) return classification;
  if (classification.evidenceKind === 'bundle' || classification.evidenceKind === 'temporal') {
    return classification;
  }

  const approximateImports = impacted.reduce((sum, quality) => sum + quality.approximateImports, 0);
  const lowConfidenceImports = impacted.reduce(
    (sum, quality) => sum + quality.lowConfidenceImports,
    0,
  );
  const limitations = impacted.reduce((sum, quality) => sum + quality.limitations, 0);
  const confidence =
    classification.confidence === 'high' && (approximateImports > 0 || lowConfidenceImports > 0)
      ? 'medium'
      : classification.confidence;
  return {
    ...classification,
    confidence,
    limitations: [
      ...classification.limitations,
      `parser uncertainty on involved modules: approximateImports=${approximateImports}, lowConfidenceImports=${lowConfidenceImports}, limitations=${limitations}`,
    ],
  };
}

function rankSignal(input: {
  severity: SignalSeverity;
  confidence: SignalConfidence;
  maturity: SignalMaturity;
  weight: number;
  limitations: readonly string[];
}): ArchitectureSignal['ranking'] {
  const severityScore = { info: 5, low: 15, medium: 35, high: 65, critical: 90 }[input.severity];
  const confidenceScore = { low: 0.55, medium: 0.8, high: 1 }[input.confidence];
  const maturityPenalty =
    input.maturity === 'experimental' ? 12 : input.maturity === 'beta' ? 4 : 0;
  const noisePenalty =
    input.confidence === 'low' ? 22 : input.limitations.length * 3 + maturityPenalty;
  const score = Math.max(
    0,
    severityScore * confidenceScore + Math.min(20, input.weight) - noisePenalty,
  );
  return {
    score,
    reasons: [
      `severity:${input.severity}`,
      `confidence:${input.confidence}`,
      `maturity:${input.maturity}`,
    ],
    noisePenalty,
    noveltyBoost: 0,
  };
}

function isSignalRegression(previous: ArchitectureSignal, current: ArchitectureSignal): boolean {
  return (
    SEVERITY_RANK[current.severity] > SEVERITY_RANK[previous.severity] ||
    confidenceRank(current.confidence) > confidenceRank(previous.confidence)
  );
}

function confidenceRank(confidence: SignalConfidence): number {
  return { low: 0, medium: 1, high: 2 }[confidence];
}

function normalizeDateMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function isSuppressionExpired(suppression: Suppression, nowMs: number): boolean {
  if (!suppression.expiresAt) return false;
  const expiresAt = Date.parse(suppression.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

function matchesSuppression(signal: ArchitectureSignal, suppression: Suppression): boolean {
  if (signal.stableKey !== suppression.stableKey) return false;
  if (suppression.moduleId && !signal.modules.includes(suppression.moduleId)) return false;
  return true;
}

function severityAtLeast(actual: SignalSeverity, min: SignalSeverity): boolean {
  return SEVERITY_RANK[actual] >= SEVERITY_RANK[min];
}

function stableSignalKey(
  kind: string,
  modules: readonly ModuleId[],
  evidence: readonly SignalEvidence[],
): string {
  return buildStableSignalKey({ kind, modules, evidence });
}

function buildStableSignalKey(input: {
  kind: string;
  modules: readonly ModuleId[];
  evidence: readonly SignalEvidence[];
  params?: Record<string, unknown>;
}): string {
  const modules = normalizeList(input.modules);
  const evidence = input.evidence
    .map((item) =>
      [
        item.kind,
        item.confidence,
        normalizeText(item.source ?? ''),
        normalizeText(item.message),
        normalizeList(item.modules ?? []).join(','),
      ].join('~'),
    )
    .sort();
  const params = input.params ? stableJson(input.params) : '';
  return [input.kind, modules.join(','), evidence.join('|'), params].map(normalizeText).join(':');
}

function normalizeList(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizePathLike))].sort();
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/gu, '/').replace(/\/+/gu, '/').trim();
}

function normalizeText(value: string): string {
  return normalizePathLike(value).replace(/\s+/gu, ' ');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).sort().join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function titleFor(rec: Recommendation): string {
  return rec.kind.replace(/-/gu, ' ');
}

function titleForMemoryRisk(risk: MemoryRiskFinding): string {
  switch (risk.kind) {
    case 'event-listener-cleanup':
      return 'Event listener cleanup risk';
    case 'timer-cleanup':
      return 'Timer cleanup risk';
    case 'observer-cleanup':
      return 'Observer cleanup risk';
    case 'object-url-cleanup':
      return 'Object URL cleanup risk';
    case 'subscription-cleanup':
      return 'Subscription cleanup risk';
  }
}

function evidenceMessage(rec: Recommendation): string {
  return `${rec.kind} legacy recommendation`;
}
