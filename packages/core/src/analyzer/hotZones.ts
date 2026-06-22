import type { ModuleId, ModuleMetrics, ModuleNode, ParsedFileSummary } from './types';

export interface RankHotZonesInput {
  modules: ModuleNode[];
  metrics: Record<ModuleId, ModuleMetrics>;
  topN?: number;
}

export function rankHotZones(input: RankHotZonesInput): ModuleId[] {
  const { modules, metrics, topN = 10 } = input;
  const candidates = modules
    .filter((m) => !m.isInfra)
    .map((m) => ({ id: m.id, score: metrics[m.id]?.hotnessScore ?? 0 }))
    .filter((x) => x.score > 0);
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // Rank the full hotness window first, then drop re-export barrels from it.
  // A barrel's high fan-out is by design, not a risk — but excluding it from the
  // candidate pool before the cut would only backfill the window with lower-
  // signal modules. Removing it from the top-N keeps the surfaced set focused on
  // genuine hot zones without inventing new ones.
  const barrels = new Set(modules.filter((m) => m.isBarrel).map((m) => m.id));
  return candidates
    .slice(0, topN)
    .map((c) => c.id)
    .filter((id) => !barrels.has(id));
}

// A barrel imports the things it re-exports, so it has a non-trivial fan-out;
// a leaf that defines its own exports has fan-out 0. Below this floor we keep
// the module even if it is thin (small multi-export utils re-export nothing).
const BARREL_MIN_FANOUT = 3;
// Barrels expose a real aggregation surface — too few pass-throughs and it is
// just a normal module with a couple of imports.
const BARREL_MIN_SURFACE = 5;
// Source lines per surface item. Barrels are thin glue (≈1–2 loc per
// re-export); real modules carry many loc per export.
const BARREL_MAX_LOC_PER_SURFACE = 4;

export interface MarkBarrelModulesInput {
  modules: ModuleNode[];
  metrics: Record<ModuleId, ModuleMetrics>;
  parserFacts?: ParsedFileSummary[];
}

/**
 * Tag re-export barrels so hot-zone ranking can skip them. Runs post-graph
 * because barrel detection needs the fan-out metric plus the module's loc and
 * export count. Mutates `ModuleNode.isBarrel` in place; additive, leaves every
 * other field untouched.
 */
export function markBarrelModules(input: MarkBarrelModulesInput): void {
  const { modules, metrics, parserFacts } = input;
  const factsByModule = indexParserFacts(parserFacts);
  for (const m of modules) {
    if (isBarrelModule(m, metrics[m.id], factsByModule)) m.isBarrel = true;
  }
}

/**
 * A re-export barrel (e.g. `packages/core/index.ts` re-exporting every module)
 * has high fan-out by design — that is its job, not a risk, and "split this
 * module" is bad advice. Detected by THINNESS rather than a re-export ratio:
 * the parser almost never populates `ExportFact.source` (star re-exports, and
 * named re-exports it can't resolve), so the ratio reads 0 even for obvious
 * barrels. A barrel instead imports the things it passes through (fan-out),
 * exposes a wide surface, and carries very few source lines per surface item —
 * it is thin glue, not a module with real logic.
 */
function isBarrelModule(
  module: ModuleNode,
  metrics: ModuleMetrics | undefined,
  factsByModule: Map<string, ParsedFileSummary>,
): boolean {
  if (!metrics) return false;
  const fanOut = metrics.fanOut;
  if (fanOut < BARREL_MIN_FANOUT) return false;
  const summary = matchParserFacts(factsByModule, module.id);
  const ownExportCount = module.exports.length || (summary?.exports.length ?? 0);
  const surface = Math.max(fanOut, ownExportCount);
  if (surface < BARREL_MIN_SURFACE) return false;
  const loc = module.loc || summary?.loc || 0;
  return loc < surface * BARREL_MAX_LOC_PER_SURFACE;
}

function indexParserFacts(
  parserFacts: ParsedFileSummary[] | undefined,
): Map<string, ParsedFileSummary> {
  const out = new Map<string, ParsedFileSummary>();
  if (!parserFacts) return out;
  for (const f of parserFacts) out.set(normalizeRel(f.relPath), f);
  return out;
}

function matchParserFacts(
  factsByModule: Map<string, ParsedFileSummary>,
  moduleId: ModuleId,
): ParsedFileSummary | undefined {
  const id = normalizeRel(moduleId);
  const direct = factsByModule.get(id);
  if (direct) return direct;
  for (const [rel, f] of factsByModule) {
    if (id.endsWith(`/${rel}`) || rel.endsWith(`/${id}`)) return f;
  }
  return undefined;
}

function normalizeRel(p: string): string {
  return p.replace(/^\.\//u, '');
}
