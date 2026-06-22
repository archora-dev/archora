import type { FileSource } from './fileSource';
import type {
  AnalyzerWarning,
  ModuleId,
  ProjectRef,
  ScanProgressCallback,
  ScanResult,
} from './types';
import { discoverFiles, compileGlob, type DiscoverOptions } from './discover';
import { createResolver } from './resolve';
import { loadAliases } from './loadAliases';
import { buildGraph } from './buildGraph';
import { detectFramework, type Framework } from './detect';
import { detectCycles } from './cycles';
import { countBrokenCycles, parseEdgeKey } from './feedbackArcSet';
import { computeMetrics } from './metrics';
import { markBarrelModules, rankHotZones } from './hotZones';
import { detectLayerViolations } from './layers';
import { computeArchDebt } from './archDebt';
import { computeRecommendations } from './recommendations';
import { applySignalSuppressions, buildArchitectureSignals } from './signals';
import { discoverEntryPoints } from './entryPoints';
import {
  loadArchoraConfigWithDiagnostics,
  resolveGeneratedPatterns,
} from '../config/frontScopeConfig';
import { feedbackArcSet } from './feedbackArcSet';
import type { FeedbackArcSetResult } from './feedbackArcSet';
import { findTypeOnlyCandidates, type TypeOnlyCandidate } from './typeOnlyCandidates';
import { checkContracts } from './contracts';
import { detectRscLeaks } from './rsc';
import { detectMemoryRisks } from './memoryRisk';
import { detectAsyncLifecycleRisks } from './asyncLifecycleRisk';
import { analyzeBundle, parseBundleStats } from './bundle';
import type { BundleThresholds, ParsedBundleStats } from './bundle/types';
import { computeChurn } from '../git/computeChurn';
import { computeTemporalCoupling } from '../git/computeTemporalCoupling';
import type { ChurnByModule, GitHistory, TemporalCoupling } from '../git/types';

export type { FileSource } from './fileSource';
export * from './types';
export { incrementalAnalyze, type IncrementalAnalyzeInput } from './incremental';
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
} from './signals';

export interface AnalyzeOptions {
  topHotZones?: number;
  onProgress?: ScanProgressCallback;
  discover?: DiscoverOptions;
  /** Pre-parsed bundler stats. When supplied, bundle-aware analysis runs. */
  bundleStats?: ParsedBundleStats;
  /** Optional override for bundle bloat thresholds. */
  bundleThresholds?: Partial<BundleThresholds>;
  /**
   * Pre-loaded git history. Browsers can't shell out, so the caller (CLI,
   * Tauri bridge) reads `git log` and hands the parsed result here. When
   * supplied, the analyzer computes per-module churn.
   */
  gitHistory?: GitHistory;
}

export async function analyze(
  source: FileSource,
  options: AnalyzeOptions = {},
): Promise<ScanResult> {
  const start = Date.now();
  const warnings: AnalyzerWarning[] = [];
  const onProgress = options.onProgress;

  onProgress?.({ phase: 'discover' });
  const project = await detectProject(source, warnings);
  const aliases = await loadAliases(source, project);
  const {
    config,
    diagnostics: configDiagnostics,
    file: configFile,
  } = await loadArchoraConfigWithDiagnostics(source);
  const configStatus = {
    state: configDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'invalid'
      : configFile
        ? 'loaded'
        : 'not-configured',
    file: configFile,
  } satisfies ScanResult['configStatus'];

  const generatedPatterns = resolveGeneratedPatterns(config.analysis?.generated);
  const generatedMode = config.analysis?.generated?.mode;
  const extraIgnore = [
    ...(options.discover?.extraIgnoreGlobs ?? []),
    ...(config.ignore ?? []),
    ...(generatedMode === 'exclude' ? generatedPatterns : []),
  ];
  const discoverOpts: DiscoverOptions = {
    ...(options.discover ?? {}),
    ...(extraIgnore.length > 0 ? { extraIgnoreGlobs: extraIgnore } : {}),
  };
  const { files } = await discoverFiles(source, discoverOpts);
  const resolver = createResolver(source, { aliases });

  const {
    modules,
    edges,
    parserFacts,
    warnings: graphWarnings,
  } = await buildGraph({
    source,
    files,
    resolver,
    aliases,
    config,
    framework: project.detectedFramework as Framework,
    ...(onProgress ? { onProgress } : {}),
  });
  warnings.push(...graphWarnings);

  if (generatedMode === 'classify' && generatedPatterns.length > 0) {
    const matchers = generatedPatterns.map(compileGlob);
    for (const m of modules) {
      if (matchers.some((re) => re.test(m.id))) m.isGenerated = true;
    }
  }

  onProgress?.({ phase: 'graph' });
  let cycles = detectCycles(modules, edges);

  // Value-syntax imports whose bindings are referenced only in type positions
  // are erased by the compiler — they never form a runtime cycle. madge reports
  // them even with `skipTypeImports` because it keys on syntax, not usage. Probe
  // every import that sits inside a cycle, drop the provably type-only ones and
  // re-detect, so Archora never counts a cycle that does not exist at runtime.
  // The candidates still flow into recommendations as the cheapest fix.
  const inCycleEdges = collectInCycleEdges(cycles, edges);
  let typeOnlyCandidates: TypeOnlyCandidate[] = [];
  let cycleEdges = edges;
  if (inCycleEdges.length > 0) {
    typeOnlyCandidates = await findTypeOnlyCandidates({ edges: inCycleEdges, source, modules });
    if (typeOnlyCandidates.length > 0) {
      const erased = new Set(typeOnlyCandidates.map((c) => erasedKey(c.from, c.to, c.specifier)));
      cycleEdges = edges.filter(
        (e) => e.kind === 'type-only' || !erased.has(erasedKey(e.from, e.to, e.specifier)),
      );
      cycles = detectCycles(modules, cycleEdges);
    }
  }

  // Compute FAS per surviving SCC for cycle.suggestedBreakpoint, using the
  // post-erasure edge set so a suggested break always cites an edge that
  // genuinely closes the cycle.
  const feedbackEdgesByCycle = cycles.map((c) => ({
    cycle: c,
    fas: feedbackArcSet(c.modules, cycleEdges),
  }));
  for (const { cycle, fas } of feedbackEdgesByCycle) {
    const bp = pickSuggestedBreakpoint(fas, cycle.modules);
    if (bp) cycle.suggestedBreakpoint = bp;
  }

  onProgress?.({ phase: 'cycles' });
  const entries = await discoverEntryPoints({
    source,
    moduleIds: modules.map((m) => m.id),
    framework: project.detectedFramework as Framework,
    ...(config.entryPoints ? { configEntryPoints: config.entryPoints } : {}),
  });

  onProgress?.({ phase: 'metrics' });
  const metrics = computeMetrics({ modules, edges, cycles, entries });

  for (const m of modules) {
    if (entries.includes(m.id) && m.kind === 'unknown') m.kind = 'entry';
  }

  markBarrelModules({ modules, metrics, parserFacts });
  const hotZones = rankHotZones({ modules, metrics, topN: options.topHotZones ?? 10 });
  const layerViolations = detectLayerViolations(modules, edges, config.layerOverrides);
  const archDebt = computeArchDebt({
    modules,
    cycles,
    layerViolations,
    metrics,
    hotZoneCount: hotZones.length,
  });
  const contractViolations = checkContracts({
    modules,
    edges,
    metrics,
    cycles,
    ...(config.contracts ? { contracts: config.contracts } : {}),
  });

  const rscLeaks = detectRscLeaks({ modules, edges });
  if (rscLeaks.length > 0) contractViolations.unshift(...rscLeaks);

  const bundleThresholds = {
    ...(config.bundle ?? {}),
    ...(options.bundleThresholds ?? {}),
  };
  const effectiveBundleStats = options.bundleStats ?? (await tryAutoLoadBundleStats(source));
  const bundle = effectiveBundleStats
    ? analyzeBundle({
        modules,
        edges,
        stats: effectiveBundleStats,
        ...(Object.keys(bundleThresholds).length > 0 ? { thresholds: bundleThresholds } : {}),
      })
    : undefined;

  // Compute temporal coupling first when history is present so that
  // recommendations can include it. `computeRecommendations` is the only
  // place where ordering matters — both blocks below feed into it.
  let churn: ChurnByModule | undefined;
  let temporalCoupling: TemporalCoupling[] | undefined;
  if (options.gitHistory) {
    churn = computeChurn({ modules, history: options.gitHistory });
    temporalCoupling = computeTemporalCoupling({
      modules,
      edges,
      history: options.gitHistory,
    });
  }

  const memoryRisks = await detectMemoryRisks({
    source,
    modules,
    framework: project.detectedFramework,
  });
  const asyncLifecycleRisks = await detectAsyncLifecycleRisks({
    source,
    modules,
    framework: project.detectedFramework,
  });

  const recommendations = computeRecommendations({
    modules,
    edges,
    metrics,
    cycles,
    layerViolations,
    hotZones,
    entries,
    typeOnlyCandidates,
    contractViolations,
    ...(bundle ? { bundleBloat: bundle.bloat } : {}),
    ...(temporalCoupling ? { temporalCoupling } : {}),
  });
  const builtSignals = buildArchitectureSignals({
    recommendations,
    warnings,
    parserFacts,
    ...(config.signals?.insightLimit !== undefined
      ? { insightLimit: config.signals.insightLimit }
      : {}),
    ...(config.signals?.minInsightSeverity
      ? { minInsightSeverity: config.signals.minInsightSeverity }
      : {}),
    ...(config.signals?.minInsightConfidence
      ? { minInsightConfidence: config.signals.minInsightConfidence }
      : {}),
    ...(memoryRisks.length > 0 ? { memoryRisks } : {}),
    ...(asyncLifecycleRisks.length > 0 ? { asyncLifecycleRisks } : {}),
  });
  const signals =
    config.signals?.suppressions && config.signals.suppressions.length > 0
      ? applySignalSuppressions(builtSignals.signals, config.signals.suppressions).signals
      : builtSignals.signals;
  const { insights } = builtSignals;

  onProgress?.({ phase: 'done' });
  return {
    project,
    modules,
    edges,
    cycles,
    metrics,
    hotZones,
    layerViolations,
    archDebt,
    recommendations,
    signals,
    insights,
    parserFacts,
    contractViolations,
    configStatus,
    ...(configDiagnostics.length > 0 ? { configDiagnostics } : {}),
    ...(bundle ? { bundle } : {}),
    ...(churn ? { churn, gitHistory: options.gitHistory } : {}),
    ...(temporalCoupling && temporalCoupling.length > 0 ? { temporalCoupling } : {}),
    ...(memoryRisks.length > 0 ? { memoryRisks } : {}),
    ...(asyncLifecycleRisks.length > 0 ? { asyncLifecycleRisks } : {}),
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    warnings,
  };
}

async function detectProject(source: FileSource, warnings: AnalyzerWarning[]): Promise<ProjectRef> {
  const rootPath = source.rootPath;
  const name = basename(rootPath);
  const id = stableHash(rootPath);

  const { framework: detectedFramework } = await detectFramework(source);

  let tsconfigPath: string | undefined;
  for (const candidate of [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.base.json',
    'jsconfig.json',
  ]) {
    if (await source.exists(candidate)) {
      tsconfigPath = candidate;
      break;
    }
  }
  if (!tsconfigPath) {
    warnings.push({ code: 'tsconfig-missing', message: 'No tsconfig.json/jsconfig.json found' });
  }

  return {
    id,
    name,
    rootPath,
    detectedFramework,
    ...(tsconfigPath !== undefined ? { tsconfigPath } : {}),
  };
}

function basename(p: string): string {
  const norm = p.replace(/\\/gu, '/').replace(/\/+$/u, '');
  const i = norm.lastIndexOf('/');
  return i === -1 ? norm : norm.slice(i + 1);
}

// Best single edge to break the SCC, ranked by `broken desc, from asc`
// to match recommendations.ts. For SCC larger than `countBrokenCycles`
// exact limit the ranking falls back to capped simple-path counts; for
// SCC with no recoverable internal edges returns undefined.
function pickSuggestedBreakpoint(
  fas: FeedbackArcSetResult,
  scc: ModuleId[],
): { from: ModuleId; to: ModuleId } | undefined {
  if (fas.feedback.size === 0) return undefined;
  const broken = countBrokenCycles(scc, fas.internal, fas.feedback);
  const ranked = [...fas.feedback]
    .map((k) => {
      const stats = broken.byEdge.get(k);
      return { key: k, broken: stats?.broken ?? 0 };
    })
    .sort((a, b) => {
      if (b.broken !== a.broken) return b.broken - a.broken;
      return a.key.localeCompare(b.key);
    });
  const best = ranked[0];
  if (!best) return undefined;
  const { from, to } = parseEdgeKey(best.key);
  // Skip self-loops on multi-node SCC: length-1 cycles already surface
  // the module on its own card.
  if (from === to && scc.length > 1) {
    const nonSelf = ranked.find(({ key }) => {
      const parsed = parseEdgeKey(key);
      return parsed.from !== parsed.to;
    });
    if (!nonSelf) return undefined;
    return parseEdgeKey(nonSelf.key);
  }
  return { from, to };
}

function erasedKey(from: string, to: string, specifier: string): string {
  return `${from}\u0001${to}\u0001${specifier}`;
}

/**
 * Every distinct (from, to, specifier) import that sits *inside* a cycle — both
 * endpoints in the same SCC. Probing all of them (not just the feedback arc set)
 * lets us spot a type-only edge wherever it lives in the loop, so a phantom
 * cycle is dropped even when the erasable import is not the one FAS would pick.
 */
function collectInCycleEdges(
  cycles: { modules: ModuleId[] }[],
  edges: { from: string; to: string; specifier: string; kind: string }[],
): { from: string; to: string; specifier: string }[] {
  if (cycles.length === 0) return [];
  const cycleOf = new Map<ModuleId, number>();
  cycles.forEach((c, i) => {
    for (const m of c.modules) cycleOf.set(m, i);
  });
  const seen = new Set<string>();
  const out: { from: string; to: string; specifier: string }[] = [];
  for (const e of edges) {
    if (e.kind === 'type-only') continue;
    const ci = cycleOf.get(e.from);
    if (ci === undefined || cycleOf.get(e.to) !== ci) continue;
    const key = erasedKey(e.from, e.to, e.specifier);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: e.from, to: e.to, specifier: e.specifier });
  }
  return out;
}

function stableHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Auto-load bundle stats from common locations next to the project root
 * (bundle-stats.json, dist/stats.json). Returns undefined when nothing is
 * found or parsing fails - silent so the UI / CLI never errors out on a
 * malformed stats file the user didn't ask us to read.
 */
async function tryAutoLoadBundleStats(source: FileSource): Promise<ParsedBundleStats | undefined> {
  const candidates = ['bundle-stats.json', 'dist/stats.json'];
  for (const candidate of candidates) {
    if (!(await source.exists(candidate))) continue;
    try {
      const text = await source.read(candidate);
      const json = JSON.parse(text) as unknown;
      const parsed = parseBundleStats(json, { rootPath: source.rootPath });
      if (parsed.format !== 'unknown') return parsed;
    } catch {
      // ignore - next candidate
    }
  }
  return undefined;
}
