// Bundle-aware analysis.
//
// `BundleReport` is computed when the user supplies a parsed bundler stats
// file (`AnalyzeOptions.bundleStats`). We never read disk here - the CLI is
// responsible for loading the file and handing us a parsed object.

import type { ModuleId } from '../types';

/** Normalized chunk after parsing whatever stats format we got. */
export interface BundleChunk {
  /** Stable identifier from the source stats (chunk id, output filename, etc.). */
  id: string;
  /** Display name (output filename when available). */
  name: string;
  /** Total chunk size in bytes. */
  size: number;
  /** Modules attached to this chunk, after path normalization. */
  modules: BundleChunkModule[];
}

export interface BundleChunkModule {
  /** Module id matching `ModuleNode.id` when resolution succeeds. */
  moduleId?: ModuleId;
  /** Path as it appears in the stats file (relative or absolute). */
  rawPath: string;
  /** Path normalized relative to project root, forward slashes. */
  normalizedPath: string;
  /** Module size inside this chunk (bytes). */
  size: number;
}

export type BundleBloatKind = 'duplicate' | 'heavy-chunk' | 'solo-hot' | 'barrel-leak';

export interface BundleBloat {
  /** Stable id for grouping/diffing. */
  id: string;
  kind: BundleBloatKind;
  severity: 'high' | 'medium' | 'low';
  /** One-line headline (rendered verbatim by CLI). */
  message: string;
  /** Module(s) implicated. */
  modules: ModuleId[];
  /** Chunk(s) involved (chunk.id values). */
  chunks: string[];
  /** Optional metric details for tooltips/CI output. */
  detail?: {
    sizeBytes?: number;
    chunkCount?: number;
    sharePercent?: number;
    /** barrel-leak: number of the barrel's re-export targets that landed in the same chunk. */
    moduleCount?: number;
  };
}

export interface BundleReport {
  /** Source format we recognized. */
  format: 'webpack' | 'rollup-visualizer' | 'unknown';
  /** Total uncompressed size summed across chunks. */
  totalSize: number;
  chunks: BundleChunk[];
  /** Map module id -> list of chunk ids it landed in. */
  moduleToChunks: Record<ModuleId, string[]>;
  /** Detected bundle-bloat issues (drives recommendations + UI). */
  bloat: BundleBloat[];
}

/** User-tunable thresholds. Wired through `.archora.json -> bundle`. */
export interface BundleThresholds {
  /** Chunk size in bytes that triggers `heavy-chunk`. */
  heavyChunkBytes: number;
  /** Module appearing in >= N chunks triggers `duplicate`. */
  duplicateMinChunks: number;
  /** Module taking >= share of a heavy chunk triggers `solo-hot` (0..1). */
  soloHotShare: number;
  /** Barrel re-exporting >= N same-tree modules is a `barrel-leak` candidate. */
  barrelMinModules: number;
  /** Share of a barrel's re-export targets co-located in its chunk to flag (0..1). */
  barrelLeakShare: number;
}

export const DEFAULT_BUNDLE_THRESHOLDS: BundleThresholds = {
  heavyChunkBytes: 500_000,
  duplicateMinChunks: 2,
  soloHotShare: 0.8,
  barrelMinModules: 8,
  barrelLeakShare: 0.8,
};

/** Parsed-but-not-yet-analyzed stats. Produced by the format parsers. */
export interface ParsedBundleStats {
  format: BundleReport['format'];
  chunks: BundleChunk[];
}
