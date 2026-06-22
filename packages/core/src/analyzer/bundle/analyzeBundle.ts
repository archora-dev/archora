// Map a parsed bundler stats payload onto the analyzer's module graph and
// derive `bundle-bloat` issues from the result.
//
// Mapping strategy: chunk modules carry a `normalizedPath`; we look it up
// against the set of `ModuleNode.id` values produced by the analyzer. Misses
// are kept on the chunk for size accounting but don't surface as recs (we'd
// flag them as "external" otherwise, which is noise on every chunk).

import type { DependencyEdge, ModuleId, ModuleNode } from '../types';
import {
  DEFAULT_BUNDLE_THRESHOLDS,
  type BundleBloat,
  type BundleChunk,
  type BundleChunkModule,
  type BundleReport,
  type BundleThresholds,
  type ParsedBundleStats,
} from './types';
import { displayShortId } from '../displayId';

export interface AnalyzeBundleInput {
  modules: ModuleNode[];
  stats: ParsedBundleStats;
  thresholds?: Partial<BundleThresholds>;
  /** Edge graph: needed for barrel-leak (re-export hubs). Without it the signal is skipped. */
  edges?: DependencyEdge[];
}

export function analyzeBundle(input: AnalyzeBundleInput): BundleReport {
  const thresholds: BundleThresholds = {
    ...DEFAULT_BUNDLE_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const moduleIds = new Set(input.modules.map((m) => m.id));

  const chunks: BundleChunk[] = input.stats.chunks.map((c) => ({
    ...c,
    modules: c.modules.map((m) => attachModuleId(m, moduleIds)),
  }));

  const moduleToChunks: Record<ModuleId, string[]> = {};
  for (const c of chunks) {
    for (const m of c.modules) {
      if (!m.moduleId) continue;
      const arr = moduleToChunks[m.moduleId] ?? [];
      if (!arr.includes(c.id)) arr.push(c.id);
      moduleToChunks[m.moduleId] = arr;
    }
  }

  const totalSize = chunks.reduce((acc, c) => acc + c.size, 0);
  const bloat = detectBloat(chunks, moduleToChunks, thresholds);
  if (input.edges && input.edges.length > 0) {
    bloat.push(
      ...detectBarrelLeaks(
        input.modules,
        input.edges,
        moduleToChunks,
        chunks,
        thresholds,
        bloat.length,
      ),
    );
  }

  return {
    format: input.stats.format,
    totalSize,
    chunks,
    moduleToChunks,
    bloat,
  };
}

function attachModuleId(m: BundleChunkModule, ids: Set<ModuleId>): BundleChunkModule {
  // Direct hit first (cheap path; covers most webpack/vite output).
  if (ids.has(m.normalizedPath)) {
    return { ...m, moduleId: m.normalizedPath };
  }
  // Some bundlers emit paths without the leading `src/` segment; try both
  // directions before giving up.
  const stripped = m.normalizedPath.replace(/^src\//u, '');
  if (ids.has(stripped)) return { ...m, moduleId: stripped };
  const prefixed = `src/${m.normalizedPath}`;
  if (ids.has(prefixed)) return { ...m, moduleId: prefixed };
  return m;
}

function detectBloat(
  chunks: BundleChunk[],
  moduleToChunks: Record<ModuleId, string[]>,
  thresholds: BundleThresholds,
): BundleBloat[] {
  const out: BundleBloat[] = [];
  let serial = 0;

  // 1. duplicate modules across chunks
  for (const [moduleId, chunkIds] of Object.entries(moduleToChunks)) {
    if (chunkIds.length < thresholds.duplicateMinChunks) continue;
    const totalSize = chunks
      .filter((c) => chunkIds.includes(c.id))
      .reduce((acc, c) => {
        const m = c.modules.find((x) => x.moduleId === moduleId);
        return acc + (m?.size ?? 0);
      }, 0);
    out.push({
      id: `bundle:dup:${serial++}:${moduleId}`,
      kind: 'duplicate',
      severity: chunkIds.length >= 4 ? 'high' : chunkIds.length >= 3 ? 'medium' : 'low',
      message: `Module "${displayShortId(moduleId)}" is duplicated across ${chunkIds.length} chunks`,
      modules: [moduleId],
      chunks: chunkIds,
      detail: { sizeBytes: totalSize, chunkCount: chunkIds.length },
    });
  }

  // 2. heavy chunks
  for (const c of chunks) {
    if (c.size < thresholds.heavyChunkBytes) continue;
    const ratio = c.size / thresholds.heavyChunkBytes;
    out.push({
      id: `bundle:heavy:${serial++}:${c.id}`,
      kind: 'heavy-chunk',
      severity: ratio >= 4 ? 'high' : ratio >= 2 ? 'medium' : 'low',
      message: `Chunk "${c.name}" is ${formatBytes(c.size)} (limit ${formatBytes(thresholds.heavyChunkBytes)})`,
      modules: c.modules.flatMap((m) => (m.moduleId ? [m.moduleId] : [])),
      chunks: [c.id],
      detail: { sizeBytes: c.size },
    });
  }

  // 3. solo-hot module: a single internal module dominates its chunk
  for (const c of chunks) {
    if (c.size === 0 || c.modules.length === 0) continue;
    const internal = c.modules.filter((m) => m.moduleId);
    if (internal.length === 0) continue;
    const top = [...internal].sort((a, b) => b.size - a.size)[0]!;
    const share = top.size / c.size;
    if (share < thresholds.soloHotShare) continue;
    // Only flag when chunk is meaningfully large; a 12 KB chunk dominated by
    // a single 11 KB module is just a normal small chunk.
    if (c.size < thresholds.heavyChunkBytes / 2) continue;
    out.push({
      id: `bundle:solo:${serial++}:${c.id}`,
      kind: 'solo-hot',
      severity: c.size >= thresholds.heavyChunkBytes ? 'high' : 'medium',
      message: `Module "${displayShortId(top.moduleId!)}" takes ${Math.round(share * 100)}% of chunk "${c.name}"`,
      modules: [top.moduleId!],
      chunks: [c.id],
      detail: { sizeBytes: top.size, sharePercent: Math.round(share * 100) },
    });
  }

  return out;
}

const BARREL_NAME_RE = /(^|\/)index\.[cm]?[jt]sx?$/u;

// barrel-leak: a barrel (re-export hub `index.*`) pulls a large share of its
// re-export targets into one chunk. Symptom of failed tree-shaking — importing the
// barrel drags the whole directory into the bundle. A "graph × bundle" signal that
// pure stats tools can't produce: targets come from the import graph, co-location
// from the chunks.
function detectBarrelLeaks(
  modules: ModuleNode[],
  edges: DependencyEdge[],
  moduleToChunks: Record<ModuleId, string[]>,
  chunks: BundleChunk[],
  thresholds: BundleThresholds,
  startSerial: number,
): BundleBloat[] {
  const out: BundleBloat[] = [];
  let serial = startSerial;

  const outgoing = new Map<ModuleId, Set<ModuleId>>();
  for (const e of edges) {
    if (e.kind === 'type-only') continue;
    let bucket = outgoing.get(e.from);
    if (!bucket) {
      bucket = new Set();
      outgoing.set(e.from, bucket);
    }
    bucket.add(e.to);
  }

  for (const b of modules) {
    if (!BARREL_NAME_RE.test(b.id)) continue;
    const bChunks = moduleToChunks[b.id];
    if (!bChunks || bChunks.length === 0) continue;
    const dir = b.id.slice(0, b.id.lastIndexOf('/') + 1);
    // re-export targets in the barrel's subtree (a barrel almost always re-exports siblings)
    const targets = [...(outgoing.get(b.id) ?? [])].filter((t) => t !== b.id && t.startsWith(dir));
    if (targets.length < thresholds.barrelMinModules) continue;

    const bChunkSet = new Set(bChunks);
    const colocated = targets.filter((t) =>
      (moduleToChunks[t] ?? []).some((c) => bChunkSet.has(c)),
    );
    const share = colocated.length / targets.length;
    if (colocated.length < thresholds.barrelMinModules || share < thresholds.barrelLeakShare) {
      continue;
    }

    const colocatedSet = new Set(colocated);
    let sizeBytes = 0;
    for (const c of chunks) {
      if (!bChunkSet.has(c.id)) continue;
      for (const m of c.modules)
        if (m.moduleId && colocatedSet.has(m.moduleId)) sizeBytes += m.size;
    }

    out.push({
      id: `bundle:barrel:${serial++}:${b.id}`,
      kind: 'barrel-leak',
      severity: colocated.length >= thresholds.barrelMinModules * 2 ? 'high' : 'medium',
      message: `Barrel "${displayShortId(b.id)}" pulls ${colocated.length}/${targets.length} re-exported modules into the same chunk (tree-shaking leak)`,
      modules: [b.id],
      chunks: [...bChunkSet],
      detail: { sizeBytes, moduleCount: colocated.length },
    });
  }

  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
