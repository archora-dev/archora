// Incremental rescan: takes the previous ScanResult and a list of changed
// relative paths. If every change is a "pure modify" of existing modules with
// static imports, we only re-resolve their outgoing edges and recompute
// downstream metrics/cycles. Otherwise we fall back to a full `analyze()`.
//
// The "simple variant" from plan 15.2: optimize only the typical IDE-save
// scenario. Glob/prefix imports, template auto-imports, config changes and
// file add/remove are routed through the full pipeline - correctness matters
// more than speed, and these cases are rare when saving a single file.

import type { FileSource } from './fileSource';
import type {
  AnalyzerWarning,
  DependencyEdge,
  FactConfidence,
  ImportResolutionKind,
  ModuleNode,
  ParsedFile,
  ParsedFileSummary,
  RawImport,
  ScanResult,
} from './types';
import { analyze, type AnalyzeOptions } from './index';
import { loadAliases } from './loadAliases';
import { createResolver } from './resolve';
import { createParserRegistry, isParseFailure } from './parsers';
import { classifyKind, isInfra } from './classify';
import { isNuxtComposablePath } from './buildGraph';
import { classifyModuleRuntime, detectRscLeaks, isServerActionsModule } from './rsc';
import { detectCycles } from './cycles';
import { computeMetrics } from './metrics';
import { rankHotZones } from './hotZones';
import { detectLayerViolations } from './layers';
import { computeArchDebt } from './archDebt';
import { computeRecommendations } from './recommendations';
import { applySignalSuppressions, buildArchitectureSignals } from './signals';
import { discoverEntryPoints } from './entryPoints';
import { checkContracts } from './contracts';
import { loadArchoraConfig } from '../config/frontScopeConfig';
import type { Framework } from './detect';

export interface IncrementalAnalyzeInput {
  prev: ScanResult;
  source: FileSource;
  /** Relative paths reported by the watcher (already debounced & deduped). */
  changedFiles: string[];
  /**
   * Files that exist now but were not in the previous scan. Currently any
   * non-empty value forces a full rescan: re-resolving prior `resolve-failed`
   * warnings against the new module ids is not (yet) implemented and would
   * otherwise leak stale warnings. Optional - watchers built on
   * `incrementalAnalyze` directly without persistent cache pass undefined.
   */
  addedFiles?: string[];
  /**
   * Files that were in the previous scan but are missing now. Handled on the
   * fast path: matching modules and incident edges are dropped and downstream
   * metrics are recomputed. Resolution warnings keyed to the removed file are
   * stripped. Edges that previously pointed *at* a removed module become
   * `resolve-failed` warnings against their `from` files - matching what a
   * cold scan would emit.
   */
  removedFiles?: string[];
  options?: AnalyzeOptions;
}

const CONFIG_PATTERNS: readonly RegExp[] = [
  /^tsconfig.*\.json$/u,
  /^vite\.config\.(?:ts|js|mts|mjs|cts|cjs)$/u,
  /^\.archora\.json$/u,
  /^package\.json$/u,
  /^nuxt\.config\.(?:ts|js|mts|mjs)$/u,
  /^svelte\.config\.(?:ts|js|mts|mjs)$/u,
];

function isConfigFile(rel: string): boolean {
  return CONFIG_PATTERNS.some((re) => re.test(rel));
}

/**
 * Re-run the analysis using the previous scan as a baseline. The function may
 * either fast-path (re-parsing only the changed modules and reusing existing
 * graph data) or fall back to a full {@link analyze} call when fast-path
 * preconditions don't hold. Either way, the returned `ScanResult` has the same
 * structure and semantics as a full scan.
 */
export async function incrementalAnalyze(input: IncrementalAnalyzeInput): Promise<ScanResult> {
  const { prev, source, changedFiles, options } = input;
  const addedFiles = input.addedFiles ?? [];
  const removedFiles = input.removedFiles ?? [];
  const start = Date.now();

  if (changedFiles.length === 0 && addedFiles.length === 0 && removedFiles.length === 0) {
    return prev;
  }

  // Adds force a full rescan: previously `resolve-failed` imports could now
  // resolve to the new files, and we don't track which warnings to retract.
  if (addedFiles.length > 0) return analyze(source, options);

  const anyConfig = [...changedFiles, ...removedFiles].some(isConfigFile);
  if (anyConfig) return analyze(source, options);

  const moduleIds = new Set(prev.modules.map((m) => m.id));
  const allChangedKnown = changedFiles.every((f) => moduleIds.has(f));
  const allRemovedKnown = removedFiles.every((f) => moduleIds.has(f));
  if (!allChangedKnown || !allRemovedKnown) return analyze(source, options);

  // Verify each changed file still exists (a delete masquerading as a modify
  // from a stale watcher batch would otherwise produce a stale module entry).
  for (const rel of changedFiles) {
    if (!(await source.exists(rel))) return analyze(source, options);
  }

  const config = await loadArchoraConfig(source);
  const aliases = await loadAliases(source, prev.project);
  const resolver = createResolver(source, { aliases });
  const registry = createParserRegistry({
    ...(config.dynamicLoaders ? { dynamicLoaders: config.dynamicLoaders } : {}),
    ...(prev.project.detectedFramework !== 'unknown'
      ? { framework: prev.project.detectedFramework as Framework }
      : {}),
  });

  // Re-parse changed files. Any glob/prefix/template-auto-import involvement
  // pushes us off the fast-path: those edge kinds are rebuilt inside
  // buildGraph from the full file list and are not safe to recompute per-file.
  const reparsed = new Map<string, ParsedFile>();
  const newWarnings: AnalyzerWarning[] = [];
  for (const rel of changedFiles) {
    let content: string;
    try {
      content = await source.read(rel);
    } catch (err) {
      newWarnings.push({
        code: 'parse-failed',
        message: 'Read failed during incremental rescan',
        file: rel,
        detail: err instanceof Error ? err.message : String(err),
      });
      return analyze(source, options);
    }
    const result = registry.parse({ relPath: rel, content });
    if (isParseFailure(result)) return analyze(source, options);
    if (result.imports.some((i) => i.pattern === 'glob' || i.pattern === 'prefix')) {
      return analyze(source, options);
    }
    if (result.templateRefs && result.templateRefs.length > 0) {
      return analyze(source, options);
    }
    // Nuxt composable auto-import edges are built from the full file list
    // (the composables/** registry crossed with consumer call identifiers) -
    // like glob/templateRefs, they can only be safely recomputed by a cold scan.
    if (prev.project.detectedFramework === 'nuxt') {
      if (
        isNuxtComposablePath(rel) ||
        (result.callIdentifiers && result.callIdentifiers.length > 0)
      ) {
        return analyze(source, options);
      }
    }
    reparsed.set(rel, result);
  }

  // Build new modules array: drop removed entries, replace changed ones.
  const removedSet = new Set(removedFiles);
  const updatedModules: ModuleNode[] = [];
  for (const m of prev.modules) {
    if (removedSet.has(m.id)) continue;
    const p = reparsed.get(m.id);
    if (!p) {
      updatedModules.push(m);
      continue;
    }
    updatedModules.push({
      id: p.relPath,
      absPath: p.relPath,
      kind: classifyKind(p, p.relPath),
      language: p.language,
      loc: p.loc,
      exports: p.exports,
      isInfra: isInfra(p.relPath),
      runtime: classifyModuleRuntime({
        relPath: p.relPath,
        framework: prev.project.detectedFramework as Framework,
        ...(p.directives ? { directives: p.directives } : {}),
        ...(p.imports.some((i) => i.specifier === 'server-only')
          ? { importsServerOnly: true }
          : {}),
        ...(p.imports.some((i) => i.specifier === 'client-only')
          ? { importsClientOnly: true }
          : {}),
      }),
      ...(isServerActionsModule(p.directives) ? { isServerActions: true } : {}),
    });
  }
  const updatedModuleIds = new Set(updatedModules.map((m) => m.id));

  // Replace outgoing edges for changed modules and drop incident edges of
  // removed ones. Edges that previously pointed *at* a removed module become
  // unresolved imports - record them as `resolve-failed` warnings on the
  // surviving `from` file (matches what a cold scan would emit).
  const changedSet = new Set(changedFiles);
  const preservedEdges: DependencyEdge[] = [];
  for (const e of prev.edges) {
    if (changedSet.has(e.from)) continue;
    if (removedSet.has(e.from)) continue;
    if (removedSet.has(e.to)) {
      newWarnings.push({
        code: 'resolve-failed',
        message: `Cannot resolve "${e.specifier}"`,
        file: e.from,
        detail: `previously resolved to "${e.to}" which was deleted`,
      });
      continue;
    }
    preservedEdges.push(e);
  }

  const newEdges: DependencyEdge[] = [];
  for (const [rel, parsed] of reparsed) {
    for (const imp of parsed.imports) {
      // we already bailed on glob/prefix above
      if (imp.pattern === 'glob' || imp.pattern === 'prefix') continue;
      if (isAssetSpecifier(imp.specifier)) continue;
      if (isExternal(imp.specifier)) continue;
      const resolved = await resolver.resolve(imp.specifier, rel);
      if (resolved && updatedModuleIds.has(resolved)) {
        if (resolved === rel) {
          newWarnings.push({
            code: 'self-import',
            message: 'Module imports itself',
            file: rel,
          });
        }
        newEdges.push({
          from: rel,
          to: resolved,
          kind: imp.kind,
          specifier: imp.specifier,
          resolved: true,
          ...edgeMeta(imp, imp.kind === 'dynamic' ? 'dynamic-literal' : 'literal', 'high', false),
        });
      } else {
        newWarnings.push({
          code: 'resolve-failed',
          message: `Cannot resolve "${imp.specifier}"`,
          file: rel,
        });
      }
    }
  }

  const allEdges = preservedEdges.concat(newEdges);

  // Downstream pure recomputation. These are O(V+E) and dominated by graph
  // size, not file IO, so they're cheap to re-run wholesale.
  const cycles = detectCycles(updatedModules, allEdges);
  const entries = await discoverEntryPoints({
    source,
    moduleIds: updatedModules.map((m) => m.id),
    framework: prev.project.detectedFramework as Framework,
    ...(config.entryPoints ? { configEntryPoints: config.entryPoints } : {}),
  });
  const metrics = computeMetrics({ modules: updatedModules, edges: allEdges, cycles, entries });
  for (const m of updatedModules) {
    if (entries.includes(m.id) && m.kind === 'unknown') m.kind = 'entry';
  }
  const hotZones = rankHotZones({
    modules: updatedModules,
    metrics,
    topN: options?.topHotZones ?? 10,
  });
  const layerViolations = detectLayerViolations(updatedModules, allEdges, config.layerOverrides);
  const archDebt = computeArchDebt({
    modules: updatedModules,
    cycles,
    layerViolations,
    metrics,
    hotZoneCount: hotZones.length,
  });
  const contractViolations = checkContracts({
    modules: updatedModules,
    edges: allEdges,
    metrics,
    cycles,
    ...(config.contracts ? { contracts: config.contracts } : {}),
  });

  const rscLeaks = detectRscLeaks({ modules: updatedModules, edges: allEdges });
  if (rscLeaks.length > 0) contractViolations.unshift(...rscLeaks);

  const recommendations = computeRecommendations({
    modules: updatedModules,
    edges: allEdges,
    metrics,
    cycles,
    layerViolations,
    hotZones,
    entries,
    typeOnlyCandidates: [],
    contractViolations,
  });
  const parserFacts = mergeParserFacts(prev.parserFacts ?? [], reparsed);

  // Carry over original analyzer warnings, drop any keyed to the changed or
  // removed files (they're being re-emitted, or no longer relevant), and
  // append our own.
  const carriedWarnings = prev.warnings.filter(
    (w) => !w.file || (!changedSet.has(w.file) && !removedSet.has(w.file)),
  );
  const warnings = [...carriedWarnings, ...newWarnings];
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
  });
  const signals =
    config.signals?.suppressions && config.signals.suppressions.length > 0
      ? applySignalSuppressions(builtSignals.signals, config.signals.suppressions).signals
      : builtSignals.signals;
  const { insights } = builtSignals;

  return {
    project: prev.project,
    modules: updatedModules,
    edges: allEdges,
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
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    warnings,
  };
}

function edgeMeta(
  imp: RawImport,
  resolutionKind: ImportResolutionKind,
  confidence: FactConfidence,
  approximate: boolean,
): Pick<DependencyEdge, 'confidence' | 'resolutionKind' | 'approximate'> {
  return {
    confidence: imp.confidence ?? confidence,
    resolutionKind: imp.resolutionKind ?? resolutionKind,
    approximate: imp.approximate ?? approximate,
  };
}

function mergeParserFacts(
  prevFacts: readonly ParsedFileSummary[],
  reparsed: ReadonlyMap<string, ParsedFile>,
): ParsedFileSummary[] {
  const changed = new Set(reparsed.keys());
  const next = prevFacts.filter((f) => !changed.has(f.relPath));
  for (const parsed of reparsed.values()) next.push(toParsedFileSummary(parsed));
  return next.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function toParsedFileSummary(file: ParsedFile): ParsedFileSummary {
  return {
    relPath: file.relPath,
    language: file.language,
    loc: file.loc,
    imports: file.imports.map((imp) => ({
      specifier: imp.specifier,
      kind: imp.kind,
      resolutionKind:
        imp.resolutionKind ??
        (isAssetSpecifier(imp.specifier)
          ? 'asset'
          : imp.kind === 'dynamic'
            ? 'dynamic-literal'
            : 'literal'),
      confidence: imp.confidence ?? 'high',
      approximate: imp.approximate ?? false,
      ...(isAssetSpecifier(imp.specifier) ? { isAsset: true } : {}),
    })),
    exports: file.exports.map((name) => ({
      name,
      kind: name === 'default' ? 'default' : 'named',
      confidence: 'medium',
    })),
    runtimeFacts: [
      {
        runtime: file.directives?.includes('use server')
          ? 'server'
          : file.directives?.includes('use client')
            ? 'client'
            : 'shared',
        source: file.directives && file.directives.length > 0 ? 'directive' : 'default',
        confidence: file.directives && file.directives.length > 0 ? 'high' : 'low',
      },
    ],
    frameworkFacts: (file.templateRefs ?? []).map((value) => ({
      kind: 'vue-template-ref',
      value,
      confidence: 'medium',
    })),
    routeFacts: [],
    stateFacts: file.hasDefineStore ? [{ kind: 'pinia-store', confidence: 'high' }] : [],
    assetFacts: file.imports
      .filter((imp) => isAssetSpecifier(imp.specifier))
      .map((imp) => ({
        specifier: imp.specifier,
        assetKind: assetKindOf(imp.specifier),
        confidence: 'high',
      })),
    limitations: file.exports.length > 0 ? ['export facts are name-only'] : [],
  };
}

function isExternal(spec: string): boolean {
  if (spec.startsWith('.') || spec.startsWith('/')) return false;
  if (spec.startsWith('@/') || spec.startsWith('~/')) return false;
  return /^[a-z@]/u.test(spec) && !spec.includes('://');
}

const ASSET_EXTS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.module.css',
  '.module.scss',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);

function isAssetSpecifier(specifier: string): boolean {
  const clean = specifier.split('?')[0] ?? specifier;
  const lower = clean.toLowerCase();
  for (const ext of ASSET_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function assetKindOf(specifier: string): 'style' | 'json' | 'image' | 'font' | 'other' {
  const clean = (specifier.split('?')[0] ?? specifier).toLowerCase();
  if (/\.(css|scss|sass|less)$/u.test(clean)) return 'style';
  if (clean.endsWith('.json')) return 'json';
  if (/\.(svg|png|jpg|jpeg|gif|webp|avif|ico)$/u.test(clean)) return 'image';
  if (/\.(woff2?|ttf|otf)$/u.test(clean)) return 'font';
  return 'other';
}
