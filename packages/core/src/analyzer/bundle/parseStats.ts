// Parse two bundler stats formats into a single normalized shape:
//
//   1. Webpack `stats.json` (or `compilation.toJson()` output): top-level
//      `{ chunks: [{ id, names, files, size, modules: [{ name, size }] }] }`.
//   2. `rollup-plugin-visualizer` JSON template: `{ tree: { name, children } }`
//      where the first level under `tree.children` is per-chunk and leaves
//      have a `value` (gzip size) / `size` (raw size) field. Nested groups
//      represent directories.
//
// Both are also produced by Vite (visualizer plugin) and Webpack respectively,
// so users on Vite/Rollup/Webpack pipelines can feed us any of them.
//
// Path normalization: we strip query strings, leading `./`, and resolve
// against the project root if the path is absolute. The result is a forward-
// slash relative path that matches `ModuleNode.id` produced by the analyzer.

import type { BundleChunk, BundleChunkModule, ParsedBundleStats } from './types';

export interface ParseStatsOptions {
  /** Project root path; used to relativize absolute module paths. */
  rootPath: string;
}

export function parseBundleStats(raw: unknown, options: ParseStatsOptions): ParsedBundleStats {
  if (!raw || typeof raw !== 'object') {
    return { format: 'unknown', chunks: [] };
  }
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r['chunks'])) {
    return parseWebpack(r['chunks'] as unknown[], options);
  }
  if (r['tree'] && typeof r['tree'] === 'object') {
    return parseRollupVisualizer(r['tree'] as Record<string, unknown>, options);
  }
  return { format: 'unknown', chunks: [] };
}

// --- webpack ---------------------------------------------------------------

function parseWebpack(rawChunks: unknown[], options: ParseStatsOptions): ParsedBundleStats {
  const chunks: BundleChunk[] = [];
  for (const c of rawChunks) {
    if (!c || typeof c !== 'object') continue;
    const cr = c as Record<string, unknown>;
    const id = stringOrNumber(cr['id']);
    if (id === null) continue;
    const names = Array.isArray(cr['names'])
      ? (cr['names'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const files = Array.isArray(cr['files'])
      ? (cr['files'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const name = files[0] ?? names[0] ?? id;
    const size = typeof cr['size'] === 'number' ? cr['size'] : 0;
    const modules: BundleChunkModule[] = [];
    if (Array.isArray(cr['modules'])) {
      for (const m of cr['modules'] as unknown[]) {
        if (!m || typeof m !== 'object') continue;
        const mr = m as Record<string, unknown>;
        const path = typeof mr['name'] === 'string' ? mr['name'] : null;
        if (!path) continue;
        const moduleSize = typeof mr['size'] === 'number' ? mr['size'] : 0;
        modules.push(buildChunkModule(path, moduleSize, options));
      }
    }
    chunks.push({ id, name, size, modules });
  }
  return { format: 'webpack', chunks };
}

// --- rollup-plugin-visualizer ---------------------------------------------

interface VisualizerNode {
  name?: unknown;
  children?: unknown;
  value?: unknown;
  size?: unknown;
}

function parseRollupVisualizer(
  tree: Record<string, unknown>,
  options: ParseStatsOptions,
): ParsedBundleStats {
  const top = (tree['children'] ?? []) as unknown[];
  if (!Array.isArray(top)) return { format: 'rollup-visualizer', chunks: [] };
  const chunks: BundleChunk[] = [];
  for (const node of top) {
    if (!node || typeof node !== 'object') continue;
    const n = node as VisualizerNode;
    const name = typeof n.name === 'string' ? n.name : '<chunk>';
    const leaves: { path: string; size: number }[] = [];
    collectVisualizerLeaves(n, '', leaves);
    if (leaves.length === 0) continue;
    const modules = leaves.map((l) => buildChunkModule(l.path, l.size, options));
    const size = leaves.reduce((acc, l) => acc + l.size, 0);
    chunks.push({ id: name, name, size, modules });
  }
  return { format: 'rollup-visualizer', chunks };
}

function collectVisualizerLeaves(
  node: VisualizerNode,
  prefix: string,
  out: { path: string; size: number }[],
): void {
  const name = typeof node.name === 'string' ? node.name : '';
  const here = prefix && name ? `${prefix}/${name}` : prefix || name;
  if (Array.isArray(node.children) && node.children.length > 0) {
    for (const child of node.children as unknown[]) {
      if (child && typeof child === 'object')
        collectVisualizerLeaves(child as VisualizerNode, here, out);
    }
    return;
  }
  // Leaf: prefer `size` (raw bytes), fall back to `value`.
  const size =
    typeof node.size === 'number' ? node.size : typeof node.value === 'number' ? node.value : 0;
  if (here) out.push({ path: here, size });
}

// --- shared helpers --------------------------------------------------------

function buildChunkModule(
  path: string,
  size: number,
  options: ParseStatsOptions,
): BundleChunkModule {
  const normalizedPath = normalizePath(path, options.rootPath);
  return { rawPath: path, normalizedPath, size };
}

function normalizePath(input: string, rootPath: string): string {
  // Strip query strings and webpack-style loader prefixes (e.g. `!!`).
  let p = input.replace(/\?.*$/u, '');
  const bang = p.lastIndexOf('!');
  if (bang !== -1) p = p.slice(bang + 1);
  p = p.replace(/\\/gu, '/');
  if (p.startsWith('./')) p = p.slice(2);

  const rootNorm = rootPath.replace(/\\/gu, '/').replace(/\/+$/u, '');
  if (rootNorm && p.startsWith(`${rootNorm}/`)) p = p.slice(rootNorm.length + 1);

  // Drop pnpm-style virtual prefixes that visualizer sometimes emits.
  p = p.replace(/^\/+/u, '');
  return p;
}

function stringOrNumber(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}
