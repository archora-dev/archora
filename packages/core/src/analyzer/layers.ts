import ignore, { type Ignore } from 'ignore';
import type { DependencyEdge, ModuleId, ModuleNode } from './types';

// FSD layers, lower index = higher. imports allowed top-down only.
// 'unknown' = outside FSD canon; edges to/from it are not flagged.
export type Layer =
  | 'app'
  | 'pages'
  | 'widgets'
  | 'features'
  | 'entities'
  | 'shared'
  | 'core'
  | 'unknown';

export const LAYER_ORDER: Layer[] = [
  'app',
  'pages',
  'widgets',
  'features',
  'entities',
  'shared',
  'core',
];

const LAYER_RANK: Record<Layer, number> = {
  app: 0,
  pages: 1,
  widgets: 2,
  features: 3,
  entities: 4,
  shared: 5,
  core: 6,
  unknown: -1,
};

export interface LayerViolation {
  edgeId: string;
  from: ModuleId;
  to: ModuleId;
  fromLayer: Layer;
  toLayer: Layer;
  severity: 'error' | 'warning';
}

/** glob → layer-name (string, not narrowed - we validate at lookup time). */
export type LayerOverrides = Record<string, string>;

/**
 * Compile `{ glob: layer }` to a fast lookup. Each entry uses gitignore-style
 * `ignore` matcher (same syntax as the rest of the project). Order is
 * preserved: first matching pattern wins, mirroring the user's mental model.
 */
interface CompiledOverride {
  pattern: string;
  layer: Layer;
  matcher: Ignore;
}

function compileOverrides(overrides: LayerOverrides | undefined): CompiledOverride[] {
  if (!overrides) return [];
  const out: CompiledOverride[] = [];
  for (const [pattern, raw] of Object.entries(overrides)) {
    if (!pattern) continue;
    if (!isLayer(raw)) continue;
    try {
      out.push({ pattern, layer: raw, matcher: ignore().add(pattern) });
    } catch {
      // bad glob - skip silently; the editor surfaces validation up-front
    }
  }
  return out;
}

function matchOverride(compiled: CompiledOverride[], moduleId: ModuleId): Layer | null {
  if (compiled.length === 0) return null;
  for (const c of compiled) {
    if (c.matcher.ignores(moduleId)) return c.layer;
  }
  return null;
}

// layer = override glob (if matches) → first `src/<layer>/...` segment → unknown.
export function detectLayer(moduleId: ModuleId, overrides?: LayerOverrides): Layer {
  const compiled = compileOverrides(overrides);
  return detectLayerInner(moduleId, compiled);
}

function detectLayerInner(moduleId: ModuleId, compiled: CompiledOverride[]): Layer {
  const overridden = matchOverride(compiled, moduleId);
  if (overridden) return overridden;
  const segments = moduleId.split('/');
  for (const seg of segments) {
    if (seg === 'src') continue;
    if (isLayer(seg)) return seg;
    return 'unknown';
  }
  return 'unknown';
}

function isLayer(s: string): s is Layer {
  return s in LAYER_RANK && s !== 'unknown';
}

export function detectLayerViolations(
  modules: ModuleNode[],
  edges: DependencyEdge[],
  overrides?: LayerOverrides,
): LayerViolation[] {
  const compiled = compileOverrides(overrides);
  const layerOf = new Map<ModuleId, Layer>();
  for (const m of modules) layerOf.set(m.id, detectLayerInner(m.id, compiled));

  const violations: LayerViolation[] = [];
  for (const e of edges) {
    if (!e.resolved) continue;
    if (e.kind === 'type-only') continue;
    const fromLayer = layerOf.get(e.from);
    const toLayer = layerOf.get(e.to);
    if (!fromLayer || !toLayer) continue;
    if (fromLayer === 'unknown' || toLayer === 'unknown') continue;
    const fromRank = LAYER_RANK[fromLayer];
    const toRank = LAYER_RANK[toLayer];
    if (fromRank > toRank) {
      // deep -> top inversion = error; adjacent = warning
      violations.push({
        edgeId: edgeId(e.from, e.to),
        from: e.from,
        to: e.to,
        fromLayer,
        toLayer,
        severity: toRank <= 1 && fromRank >= 4 ? 'error' : 'warning',
      });
    }
  }
  return violations;
}

/**
 * Re-run layer assignment + violation detection against an existing
 * `ScanResult`-shaped input without re-parsing files. Used by the layer-rules
 * editor to provide live preview while the user is typing.
 */
export interface RecomputeLayersInput {
  modules: ModuleNode[];
  edges: DependencyEdge[];
  overrides?: LayerOverrides;
}

export interface RecomputeLayersOutput {
  violations: LayerViolation[];
  byModule: Record<ModuleId, Layer>;
}

export function recomputeLayers(input: RecomputeLayersInput): RecomputeLayersOutput {
  const compiled = compileOverrides(input.overrides);
  const byModule: Record<ModuleId, Layer> = {};
  for (const m of input.modules) byModule[m.id] = detectLayerInner(m.id, compiled);
  const violations = detectLayerViolations(input.modules, input.edges, input.overrides);
  return { violations, byModule };
}

/**
 * Validate a single override pattern. Returns null when fine, or an error
 * code when the glob is empty / produces a matcher rejection. Layer names
 * are validated separately (UI uses `LAYER_ORDER` to populate the dropdown).
 */
export type LayerOverrideError = 'empty' | 'invalid-glob' | 'unknown-layer';

export function validateLayerOverride(pattern: string, layer: string): LayerOverrideError | null {
  if (!pattern.trim()) return 'empty';
  if (!isLayer(layer)) return 'unknown-layer';
  try {
    ignore().add(pattern);
  } catch {
    return 'invalid-glob';
  }
  return null;
}

function edgeId(from: ModuleId, to: ModuleId): string {
  return `${from}\u0001${to}`;
}
