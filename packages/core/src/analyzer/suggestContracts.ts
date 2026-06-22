// Auto-suggest contract rules.
//
// Walks an already-built scan and proposes a `.archora.json -> contracts`
// block that codifies the architectural intent visible in the code:
//
//   - `features-isolation` boundary when there's a `features/*` folder,
//     cross-instance `must-not` between siblings.
//   - `layer-discipline` boundaries derived from observed layer violations:
//     for every (lowerLayer -> higherLayer) pair that the code already
//     respects (no violations going the wrong way), we don't propose;
//     for pairs the user violates, we DO propose `must-not` so they get
//     a CI gate the moment they fix the existing violations.
//   - `no-cycles` budgets for folders that currently have 0 cycles - locks
//     them in.
//
// The generator never proposes rules that already exist in the loaded
// `.archora.json` (matched by `name` + same `from`/`to`/`module` shape).
// CLI consumes the output via `archora suggest contracts`; UI offers
// "copy as .archora.json".

import type { ContractsConfig } from '../config/frontScopeConfig';
import { detectLayer, LAYER_ORDER, type Layer } from './layers';
import type { Cycle, DependencyEdge, ModuleNode } from './types';

export interface SuggestContractsInput {
  modules: ModuleNode[];
  edges: DependencyEdge[];
  cycles: Cycle[];
  /** Current contracts block, if any - used to suppress duplicates. */
  existing?: ContractsConfig;
}

/**
 * Structured reason for i18n consumers (UI). The `key` is a stable i18n key
 * the host can translate; `params` are interpolation values. CLI/JSON readers
 * keep using the plain `reasons` map.
 */
export interface SuggestedReason {
  key: string;
  params: Record<string, string | number>;
}

export interface SuggestedContracts {
  contracts: ContractsConfig;
  /** Human-readable explanations per rule, keyed by `rule.name`. English. */
  reasons: Record<string, string>;
  /** i18n-friendly explanations per rule, same keys as `reasons`. */
  reasonKeys: Record<string, SuggestedReason>;
}

const FEATURES_GLOB = 'src/features/*/**';
const FEATURE_RULE_NAME = 'features-isolation';

export function suggestContracts(input: SuggestContractsInput): SuggestedContracts {
  const reasons: Record<string, string> = {};
  const reasonKeys: Record<string, SuggestedReason> = {};
  const out: ContractsConfig = {};
  const existing = input.existing ?? {};

  const boundaries = collectBoundarySuggestions(input, existing, reasons, reasonKeys);
  if (boundaries.length > 0) out.boundaries = boundaries;

  const budgets = collectBudgetSuggestions(input, existing, reasons, reasonKeys);
  if (budgets.length > 0) out.budgets = budgets;

  return { contracts: out, reasons, reasonKeys };
}

function collectBoundarySuggestions(
  input: SuggestContractsInput,
  existing: ContractsConfig,
  reasons: Record<string, string>,
  reasonKeys: Record<string, SuggestedReason>,
): NonNullable<ContractsConfig['boundaries']> {
  const out: NonNullable<ContractsConfig['boundaries']> = [];
  const existingByName = new Set(existing.boundaries?.map((r) => r.name) ?? []);

  // 1) features-isolation
  const hasFeatures = input.modules.some((m) => m.id.startsWith('src/features/'));
  if (hasFeatures && !existingByName.has(FEATURE_RULE_NAME)) {
    // Only propose if at least one cross-feature edge currently exists or
    // is plausible (multiple feature folders). One-feature projects get a
    // less useful rule.
    const featureRoots = collectImmediateChildrenUnder(input.modules, 'src/features/');
    if (featureRoots.size >= 2) {
      out.push({
        name: FEATURE_RULE_NAME,
        from: FEATURES_GLOB,
        to: FEATURES_GLOB,
        mode: 'must-not',
        crossInstance: true,
        description: 'Features must be self-contained. Cross-feature imports go through shared/.',
      });
      reasons[FEATURE_RULE_NAME] =
        `Found ${featureRoots.size} feature folders under src/features/. The rule forbids sibling-to-sibling imports.`;
      reasonKeys[FEATURE_RULE_NAME] = {
        key: 'featuresIsolation',
        params: { count: featureRoots.size },
      };
    }
  }

  // 2) layer-discipline: propose `must-not` for every observed violation
  //    direction we can name from FSD layers. We collapse all per-edge
  //    layer violations into per-(fromLayer,toLayer) suggestions.
  const layerPairs = new Map<string, { fromLayer: Layer; toLayer: Layer; count: number }>();
  for (const e of input.edges) {
    if (e.kind === 'type-only') continue;
    const fromLayer = detectLayer(e.from);
    const toLayer = detectLayer(e.to);
    if (fromLayer === 'unknown' || toLayer === 'unknown') continue;
    const fromRank = LAYER_ORDER.indexOf(fromLayer);
    const toRank = LAYER_ORDER.indexOf(toLayer);
    // LAYER_ORDER goes UI -> core (smaller rank = closer to UI).
    // Allowed direction: smaller rank importing larger rank (UI pulls in
    // shared/core). Violation: bigger rank importing smaller rank
    // (core/shared reaching up into widgets/features).
    if (fromRank <= toRank) continue;
    const key = `${fromLayer}->${toLayer}`;
    const cur = layerPairs.get(key);
    if (cur) cur.count += 1;
    else layerPairs.set(key, { fromLayer, toLayer, count: 1 });
  }
  for (const { fromLayer, toLayer, count } of layerPairs.values()) {
    const name = `layer-${fromLayer}-not-${toLayer}`;
    if (existingByName.has(name)) continue;
    out.push({
      name,
      from: `src/${fromLayer}/**`,
      to: `src/${toLayer}/**`,
      mode: 'must-not',
      severity: 'error',
      description: `${fromLayer} should not import from ${toLayer} (FSD layer order).`,
    });
    reasons[name] =
      `Observed ${count} edge(s) from ${fromLayer} into ${toLayer}; codify the rule to prevent regression after the fix.`;
    reasonKeys[name] = {
      key: 'layerDiscipline',
      params: { count, fromLayer, toLayer },
    };
  }

  return out;
}

function collectBudgetSuggestions(
  input: SuggestContractsInput,
  existing: ContractsConfig,
  reasons: Record<string, string>,
  reasonKeys: Record<string, SuggestedReason>,
): NonNullable<ContractsConfig['budgets']> {
  const out: NonNullable<ContractsConfig['budgets']> = [];
  const existingByName = new Set(existing.budgets?.map((r) => r.name) ?? []);

  // shared/** + entities/** + core/** are common "no-cycles" candidates.
  // Only propose when the current scan has zero cycles touching them - a
  // suggestion that fails on day one is worse than no suggestion.
  const candidates: { glob: string; label: string }[] = [
    { glob: 'src/shared/**', label: 'shared' },
    { glob: 'src/entities/**', label: 'entities' },
    { glob: 'src/core/**', label: 'core' },
    { glob: 'src/shared/ui/**', label: 'shared/ui' },
  ];
  for (const c of candidates) {
    const name = `no-cycles-${c.label.replace(/\//gu, '-')}`;
    if (existingByName.has(name)) continue;
    if (!hasModulesUnder(input.modules, c.glob)) continue;
    if (countCyclesUnder(input.cycles, c.glob) > 0) continue;
    out.push({
      name,
      module: c.glob,
      maxCycles: 0,
      severity: 'warning',
      description: `Lock cycle count at 0 in ${c.label}; the layer is currently clean.`,
    });
    reasons[name] = `${c.label} currently has 0 cycles - lock it in to catch regressions.`;
    reasonKeys[name] = { key: 'noCycles', params: { label: c.label } };
  }

  return out;
}

function collectImmediateChildrenUnder(modules: ModuleNode[], prefix: string): Set<string> {
  const out = new Set<string>();
  for (const m of modules) {
    if (!m.id.startsWith(prefix)) continue;
    const tail = m.id.slice(prefix.length);
    const slash = tail.indexOf('/');
    if (slash <= 0) continue;
    out.add(tail.slice(0, slash));
  }
  return out;
}

// Glob support is intentionally narrow: we only emit globs that follow the
// `prefix/**` shape, so a string-prefix check is exact.
function globPrefix(glob: string): string {
  const idx = glob.indexOf('/**');
  return idx === -1 ? glob : glob.slice(0, idx + 1);
}

function hasModulesUnder(modules: ModuleNode[], glob: string): boolean {
  const p = globPrefix(glob);
  return modules.some((m) => m.id.startsWith(p));
}

function countCyclesUnder(cycles: Cycle[], glob: string): number {
  const p = globPrefix(glob);
  let n = 0;
  for (const c of cycles) {
    if (c.modules.some((id) => id.startsWith(p))) n += 1;
  }
  return n;
}
