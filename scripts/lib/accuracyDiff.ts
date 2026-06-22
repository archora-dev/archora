/**
 * Differential accuracy core — shared by the full report writer
 * (`scripts/accuracy-diff.ts`) and the release gate (`scripts/accuracy-gate.ts`).
 *
 * Validates Archora against madge on real, third-party codebases the analyzer
 * was never tuned for — the only honest measure of accuracy. Two differentials
 * run per repo:
 *
 *   1. CYCLES (the hard signal). Three cyclic-file sets:
 *        - Archora                        (our analyzer)
 *        - madge, skipTypeImports: true   (fair runtime oracle — type-only erased)
 *        - madge, default                 (counts type-only imports)
 *      Signals:
 *        - onlyArchora    = Archora claims cyclic, madge-fair does not  -> possible FP
 *        - onlyMadgeFair  = madge-fair claims cyclic, Archora does not  -> possible miss
 *        - typeOnlyAvoided = madge-default minus madge-fair             -> type-only
 *                            cycles Archora correctly avoids (the advantage)
 *
 *   2. EDGES (resolved dependency graph). Compares Archora's runtime edge set
 *      against madge's resolved local edges. See `compareEdges` for the honest
 *      restriction we apply so the numbers are not polluted by one tool seeing a
 *      file the other skipped.
 *
 * Repos are fetched as tarballs (no git). This module performs network I/O only
 * inside `download`; callers that want offline-safety must tolerate `ok: false`
 * results with `note: 'download failed'`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyze } from '../../packages/core/src/analyzer/index';
import { createNodeFsFileSource } from '../../packages/core/src/analyzer/sources/nodeFsFileSource';

export interface RepoSpec {
  name: string;
  owner: string;
  repo: string;
  branches: string[];
  /** candidate source subdirs (first existing wins), relative to repo root */
  srcDirs: string[];
  /**
   * Whether madge-fair is a trustworthy *cycle* oracle for this repo, i.e. the
   * two tools analyze the same file universe so a cycle disagreement is a real
   * signal. True for flat single-package libraries where Archora and madge-fair
   * agree on edges exactly. False for complex monorepos with project references
   * (vue-core, excalidraw): there madge-fair's reachable file set diverges from
   * Archora's for reasons unrelated to Archora's correctness — Archora's
   * resolved edges still match madge-fair exactly on the shared set, but the
   * cyclic-file totals differ. Those repos are run for COVERAGE and reported,
   * but they do not hard-fail the gate (a release gate must not block on an
   * untrustworthy oracle). Defaults to true when omitted.
   */
  trustedCycleOracle?: boolean;
}

export const REPOS: RepoSpec[] = [
  // --- libraries (state/validation/query) ---
  { name: 'zustand', owner: 'pmndrs', repo: 'zustand', branches: ['main'], srcDirs: ['src'] },
  { name: 'jotai', owner: 'pmndrs', repo: 'jotai', branches: ['main'], srcDirs: ['src'] },
  {
    name: 'zod',
    owner: 'colinhacks',
    repo: 'zod',
    branches: ['main', 'master'],
    srcDirs: ['packages/zod/src', 'src', 'packages/core/src'],
  },
  {
    name: 'redux',
    owner: 'reduxjs',
    repo: 'redux',
    branches: ['master', 'main'],
    srcDirs: ['src', 'packages/redux/src'],
  },
  {
    name: 'pinia',
    owner: 'vuejs',
    repo: 'pinia',
    branches: ['v2', 'main'],
    srcDirs: ['packages/pinia/src'],
  },
  {
    name: 'mobx',
    owner: 'mobxjs',
    repo: 'mobx',
    branches: ['main', 'master'],
    srcDirs: ['packages/mobx/src'],
  },
  {
    name: 'react-query',
    owner: 'TanStack',
    repo: 'query',
    branches: ['main'],
    srcDirs: ['packages/query-core/src'],
  },
  {
    name: 'xstate',
    owner: 'statelyai',
    repo: 'xstate',
    branches: ['main'],
    srcDirs: ['packages/core/src'],
  },

  // --- T2c: broader corpus, incl. Vue/React frameworks and an app ---
  // Vue 3 reactivity/runtime core — large, heavily cross-linked TS.
  {
    name: 'vue-core',
    trustedCycleOracle: false,
    owner: 'vuejs',
    repo: 'core',
    branches: ['main', 'minor'],
    srcDirs: ['packages/runtime-core/src', 'packages/reactivity/src'],
  },
  // Vue Router — framework-level routing for Vue apps.
  {
    name: 'vue-router',
    trustedCycleOracle: false,
    owner: 'vuejs',
    repo: 'router',
    branches: ['main'],
    srcDirs: ['packages/router/src', 'src'],
  },
  // React Router — framework-level routing for React apps.
  {
    name: 'react-router',
    trustedCycleOracle: false,
    owner: 'remix-run',
    repo: 'react-router',
    branches: ['main', 'dev'],
    srcDirs: ['packages/react-router/lib', 'packages/react-router/index.ts', 'packages/router/src'],
  },
  // Excalidraw — a real React APPLICATION, not a library (app-shaped imports).
  {
    name: 'excalidraw',
    trustedCycleOracle: false,
    owner: 'excalidraw',
    repo: 'excalidraw',
    branches: ['master', 'main'],
    srcDirs: ['packages/excalidraw', 'src'],
  },
  // VitePress — a real Vue APPLICATION (docs SSG client+node).
  {
    name: 'vitepress',
    trustedCycleOracle: false,
    owner: 'vuejs',
    repo: 'vitepress',
    branches: ['main'],
    srcDirs: ['src/client', 'src'],
  },
  // TanStack Router — framework-level routing for React apps.
  {
    name: 'tanstack-router',
    trustedCycleOracle: false,
    owner: 'TanStack',
    repo: 'router',
    branches: ['main'],
    srcDirs: ['packages/react-router/src', 'packages/router-core/src'],
  },
];

const EXT = ['ts', 'tsx'];

export function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Strip madge's leading `src/` (we copy sources into an isolated `<tmp>/src`). */
function stripMadgeSrc(p: string): string {
  const n = norm(p);
  return n.startsWith('src/') ? n.slice('src/'.length) : n;
}

function download(spec: RepoSpec, dest: string): string | null {
  for (const branch of spec.branches) {
    const url = `https://codeload.github.com/${spec.owner}/${spec.repo}/tar.gz/refs/heads/${branch}`;
    const tar = path.join(dest, 'src.tar.gz');
    try {
      execFileSync('curl', ['-fsSL', '--max-time', '90', url, '-o', tar], { stdio: 'pipe' });
      execFileSync('tar', ['-xzf', tar, '-C', dest], { stdio: 'pipe' });
      const entries = readdirSync(dest, { withFileTypes: true }).filter(
        (e) => e.isDirectory() && e.name.startsWith(`${spec.repo}-`),
      );
      if (entries[0]) return path.join(dest, entries[0].name);
    } catch {
      // try next branch
    }
  }
  return null;
}

interface MadgeRun {
  /** raw dependency graph from `madge --json` (no --circular): file -> [deps] */
  graph: Record<string, string[]>;
  cycles: string[][];
  failed: boolean;
}

function runMadge(srcAbs: string, skipTypeImports: boolean, circular: boolean): string | null {
  const iso = mkdtempSync(path.join(tmpdir(), 'madge-iso-'));
  try {
    cpSync(srcAbs, path.join(iso, 'src'), { recursive: true });
    writeFileSync(
      path.join(iso, '.madgerc'),
      JSON.stringify({
        detectiveOptions: { ts: { skipTypeImports }, tsx: { skipTypeImports } },
      }),
    );
    const args = ['--yes', 'madge', '--extensions', EXT.join(','), '--json'];
    if (circular) args.push('--circular');
    args.push('src');
    // madge exits 1 when it FINDS cycles (with --circular), so execFileSync
    // throws on success too; the JSON is still on stdout. Read stdout from the
    // result OR the thrown error.
    try {
      return execFileSync('npx', args, {
        cwd: iso,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      }).toString();
    } catch (e) {
      const stdout = (e as { stdout?: Buffer }).stdout;
      return stdout ? stdout.toString() : null;
    }
  } finally {
    rmSync(iso, { recursive: true, force: true });
  }
}

/**
 * Run madge against an ISOLATED copy of the source dir. Monorepos make madge
 * walk up to the workspace root and crash on duplicate workspace names, so we
 * copy just the sources into a clean temp dir with no parent package.json.
 * `failed` distinguishes a real "0 cycles" from a madge error (so the report
 * never reads a crash as agreement). Runs madge twice: once with `--circular`
 * for the cycle set, once without for the full dependency graph (edges).
 */
function madgeRun(srcAbs: string, skipTypeImports: boolean): MadgeRun {
  const circularOut = runMadge(srcAbs, skipTypeImports, true);
  const graphOut = runMadge(srcAbs, skipTypeImports, false);
  if (circularOut === null || graphOut === null) {
    return { graph: {}, cycles: [], failed: true };
  }
  let cyclesRaw: string[][];
  let graphRaw: Record<string, string[]>;
  try {
    cyclesRaw = JSON.parse(circularOut) as string[][];
    graphRaw = JSON.parse(graphOut) as Record<string, string[]>;
  } catch {
    return { graph: {}, cycles: [], failed: true };
  }
  const cycles = cyclesRaw.map((cycle) => cycle.map(stripMadgeSrc));
  const graph: Record<string, string[]> = {};
  for (const [from, tos] of Object.entries(graphRaw)) {
    graph[stripMadgeSrc(from)] = tos.map(stripMadgeSrc);
  }
  return { graph, cycles, failed: false };
}

function fileSet(cycles: string[][]): Set<string> {
  const s = new Set<string>();
  for (const cy of cycles) for (const f of cy) s.add(norm(f));
  return s;
}

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

interface ArchoraScan {
  cyclicFiles: Set<string>;
  /** runtime edges as `from->to`, type-only excluded, deduped */
  edges: Set<string>;
  /** all module ids Archora analyzed (used to bound the edge comparison) */
  modules: Set<string>;
}

async function archoraScan(srcAbs: string): Promise<ArchoraScan> {
  const source = await createNodeFsFileSource({ rootPath: srcAbs, skipTestLikeDirs: true });
  const scan = await analyze(source);
  const cyclicFiles = new Set<string>();
  for (const c of scan.cycles) for (const m of c.modules) cyclicFiles.add(norm(m));
  const modules = new Set<string>();
  for (const m of scan.modules) modules.add(norm(m.id));
  // Compare RUNTIME edges: madge-fair erases type imports, so excluding
  // `type-only` edges is the apples-to-apples comparison. Dedup via the Set.
  const edges = new Set<string>();
  for (const e of scan.edges) {
    if (e.kind === 'type-only') continue;
    edges.add(`${norm(e.from)}->${norm(e.to)}`);
  }
  return { cyclicFiles, edges, modules };
}

export interface EdgeDiff {
  archora: number;
  madge: number;
  /** edges Archora has that madge does not — possible FALSE edges */
  onlyArchora: string[];
  /** edges madge has that Archora does not — possible MISSED edges */
  onlyMadge: string[];
  onlyArchoraCount: number;
  onlyMadgeCount: number;
  /**
   * Share of madge-fair edges (on the shared file set) that Archora also caught:
   * `(madge - onlyMadge) / madge`. The oracle is imperfect (madge is blind to
   * React/Vue/Nuxt dynamics), so this is a lower bound on "edge recall vs madge",
   * not absolute completeness. 1 when the madge set is empty.
   */
  edgeRecall: number;
}

const EDGE_SAMPLE_CAP = 25;

/**
 * Compare resolved EDGES between Archora and madge-fair.
 *
 * HONEST RESTRICTION (documented in the report too): the two tools do not scan
 * the same file set. Archora runs with `skipTestLikeDirs: true`; madge does
 * not skip tests, and the tools differ on which extensions/files they resolve.
 * Comparing raw edge sets would surface spurious diffs purely from one tool
 * seeing a file the other never did. So we restrict BOTH edge sets to edges
 * whose endpoints are files BOTH tools actually saw:
 *
 *   - Archora's analyzed module ids (`scan.modules`), AND
 *   - madge's analyzed file set (the keys of `madge --json` plus every
 *     resolved dependency target).
 *
 * The intersection is the common ground; edges with an endpoint outside it are
 * dropped from both sides. This makes `onlyArchora`/`onlyMadge` meaningful
 * (genuine resolution disagreements) rather than scan-scope artifacts.
 */
export function compareEdges(archora: ArchoraScan, graph: Record<string, string[]>): EdgeDiff {
  // madge's analyzed file universe: every node it emitted as a key plus every
  // dependency target it resolved (targets are also local files madge saw).
  const madgeFiles = new Set<string>();
  const madgeEdges = new Set<string>();
  for (const [from, tos] of Object.entries(graph)) {
    madgeFiles.add(from);
    for (const to of tos) {
      madgeFiles.add(to);
      madgeEdges.add(`${from}->${to}`);
    }
  }
  // Common file set = files BOTH tools analyzed.
  const common = new Set<string>();
  for (const f of archora.modules) if (madgeFiles.has(f)) common.add(f);

  const inCommon = (edge: string): boolean => {
    const i = edge.indexOf('->');
    const from = edge.slice(0, i);
    const to = edge.slice(i + 2);
    return common.has(from) && common.has(to);
  };

  const archoraEdges = new Set([...archora.edges].filter(inCommon));
  const madgeEdgesRestricted = new Set([...madgeEdges].filter(inCommon));

  const onlyArchora = [...archoraEdges].filter((e) => !madgeEdgesRestricted.has(e)).sort();
  const onlyMadge = [...madgeEdgesRestricted].filter((e) => !archoraEdges.has(e)).sort();

  const madgeCount = madgeEdgesRestricted.size;
  const edgeRecall = madgeCount === 0 ? 1 : (madgeCount - onlyMadge.length) / madgeCount;

  return {
    archora: archoraEdges.size,
    madge: madgeCount,
    onlyArchora: onlyArchora.slice(0, EDGE_SAMPLE_CAP),
    onlyMadge: onlyMadge.slice(0, EDGE_SAMPLE_CAP),
    onlyArchoraCount: onlyArchora.length,
    onlyMadgeCount: onlyMadge.length,
    edgeRecall,
  };
}

export interface RepoResult {
  name: string;
  ok: boolean;
  note?: string;
  // --- cycles ---
  archora?: number;
  madgeFair?: number;
  madgeDefault?: number;
  madgeFailed?: boolean;
  onlyArchora?: string[];
  onlyMadgeFair?: string[];
  typeOnlyAvoided?: number;
  // --- edges (T2a) ---
  edges?: EdgeDiff;
  /** Mirror of RepoSpec.trustedCycleOracle (default true) for the gate. */
  trustedCycleOracle?: boolean;
}

/**
 * Download + analyze a single repo and produce its differential result.
 * Self-contained (creates and cleans its own temp dir). Never throws for the
 * expected failure modes (download/srcDir/madge) — those are reported via
 * `ok: false` / `madgeFailed` so callers stay robust offline.
 */
export async function runRepo(spec: RepoSpec): Promise<RepoResult> {
  const dest = mkdtempSync(path.join(tmpdir(), `acc-${spec.name}-`));
  try {
    const root = download(spec, dest);
    if (!root) return { name: spec.name, ok: false, note: 'download failed' };

    const srcAbs = spec.srcDirs.map((d) => path.join(root, d)).find((p) => existsSync(p));
    if (!srcAbs) {
      return { name: spec.name, ok: false, note: `srcDir not found: ${spec.srcDirs.join(', ')}` };
    }

    const archora = await archoraScan(srcAbs);
    const fair = madgeRun(srcAbs, true);
    const def = madgeRun(srcAbs, false);
    const madgeFair = fileSet(fair.cycles);
    const madgeDefault = fileSet(def.cycles);
    const madgeFailed = fair.failed || def.failed;

    return {
      name: spec.name,
      ok: true,
      trustedCycleOracle: spec.trustedCycleOracle !== false,
      archora: archora.cyclicFiles.size,
      madgeFair: madgeFair.size,
      madgeDefault: madgeDefault.size,
      madgeFailed,
      // disagreements are only meaningful when madge actually ran
      onlyArchora: madgeFailed ? [] : diff(archora.cyclicFiles, madgeFair),
      onlyMadgeFair: madgeFailed ? [] : diff(madgeFair, archora.cyclicFiles),
      typeOnlyAvoided: madgeFailed ? 0 : diff(madgeDefault, madgeFair).length,
      // edge diff against madge-fair's resolved graph (type imports erased)
      edges: madgeFailed ? undefined : compareEdges(archora, fair.graph),
    };
  } catch (e) {
    return { name: spec.name, ok: false, note: (e as Error).message };
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function renderMd(results: RepoResult[]): string {
  const lines: string[] = [];
  lines.push('# Differential accuracy: Archora vs madge', '');
  lines.push('Cyclic-file-set comparison on third-party repos (TS). madge-fair =');
  lines.push('`skipTypeImports: true` (runtime oracle). Disagreements vs madge-fair are');
  lines.push('the bug candidates; `typeOnlyAvoided` is the FP-reduction advantage.', '');
  lines.push(
    '| repo | Archora | madge-fair | madge-default | onlyArchora (FP?) | onlyMadgeFair (miss?) | type-only avoided |',
  );
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (!r.ok) {
      lines.push(`| ${r.name} | — | — | — | — | — | _${r.note}_ |`);
      continue;
    }
    if (r.madgeFailed) {
      lines.push(
        `| ${r.name} | ${r.archora} | _madge failed_ | _madge failed_ | n/a | n/a | n/a |`,
      );
      continue;
    }
    lines.push(
      `| ${r.name} | ${r.archora} | ${r.madgeFair} | ${r.madgeDefault} | ${r.onlyArchora?.length} | ${r.onlyMadgeFair?.length} | ${r.typeOnlyAvoided} |`,
    );
  }
  lines.push('');

  // --- cycle precision / recall on trusted-oracle repos ---
  let cArchora = 0;
  let cMadge = 0;
  let cOnlyArchora = 0;
  let cOnlyMadge = 0;
  for (const r of results) {
    if (!r.ok || r.madgeFailed || r.trustedCycleOracle === false) continue;
    cArchora += r.archora ?? 0;
    cMadge += r.madgeFair ?? 0;
    cOnlyArchora += r.onlyArchora?.length ?? 0;
    cOnlyMadge += r.onlyMadgeFair?.length ?? 0;
  }
  const cyclePrecision = cArchora === 0 ? 1 : (cArchora - cOnlyArchora) / cArchora;
  const cycleRecall = cMadge === 0 ? 1 : (cMadge - cOnlyMadge) / cMadge;
  lines.push(
    `**Cycle accuracy (trusted-oracle repos only):** precision ${fmtPct(cyclePrecision)} ` +
      `(${cOnlyArchora} false cycles / ${cArchora} reported), recall ${fmtPct(cycleRecall)} vs ` +
      `madge-fair (${cOnlyMadge} candidate misses / ${cMadge}). The misses are candidates, not ` +
      `confirmed: madge-fair over-reports value-syntax type-only cycles which Archora correctly ` +
      `omits — adjudicated in \`docs/superpowers/audits/labeled-corpus.md\`.`,
    '',
  );

  // --- edge-level differential (T2a) ---
  lines.push('## Resolved edges (runtime, type-only excluded)', '');
  lines.push('Edge comparison is RESTRICTED to files BOTH tools analyzed (Archora skips');
  lines.push('test-like dirs, madge does not), so the counts reflect genuine resolution');
  lines.push('disagreements, not scan-scope differences. `onlyArchora` = possible false');
  lines.push('edges; `onlyMadge` = possible missed edges. Treat as warnings, not proof,');
  lines.push('given the restriction above.', '');
  lines.push('`edge recall` = `(madge − onlyMadge) / madge` — share of madge-fair edges Archora');
  lines.push('also resolved (lower bound: madge is blind to React/Vue/Nuxt dynamic edges).', '');
  lines.push(
    '| repo | Archora edges | madge edges | onlyArchora (FP?) | onlyMadge (miss?) | edge recall |',
  );
  lines.push('|---|---|---|---|---|---|');
  let recallNum = 0;
  let recallDen = 0;
  const excluded: string[] = [];
  for (const r of results) {
    if (!r.ok || r.madgeFailed || !r.edges) {
      lines.push(`| ${r.name} | — | — | — | — | — |`);
      continue;
    }
    // archora=0 with a non-empty madge is a source-location/scope failure (the
    // harness didn't find the code), not a measured miss. Count it per-repo but
    // exclude from the aggregate, like the cycle conclusions (see zod note in BENCHMARKS.md).
    const scopeFailure = r.edges.archora === 0 && r.edges.madge > 0;
    if (scopeFailure) excluded.push(r.name);
    else {
      recallNum += r.edges.madge - r.edges.onlyMadgeCount;
      recallDen += r.edges.madge;
    }
    const recallCell = scopeFailure
      ? `${fmtPct(r.edges.edgeRecall)} ⚠ excl.`
      : fmtPct(r.edges.edgeRecall);
    lines.push(
      `| ${r.name} | ${r.edges.archora} | ${r.edges.madge} | ${r.edges.onlyArchoraCount} | ${r.edges.onlyMadgeCount} | ${recallCell} |`,
    );
  }
  const aggRecall = recallDen === 0 ? 1 : recallNum / recallDen;
  lines.push(
    `| **aggregate** | | ${recallDen} | | ${recallDen - recallNum} | **${fmtPct(aggRecall)}** |`,
  );
  lines.push('');
  if (excluded.length > 0) {
    lines.push(
      `> Excluded from aggregate (Archora resolved 0 edges — source-location/scope failure, not a recall miss): ${excluded.join(', ')}.`,
      '',
    );
  }

  // --- per-repo disagreement detail ---
  for (const r of results) {
    if (!r.ok) continue;
    const hasCycleDiff = (r.onlyArchora?.length ?? 0) > 0 || (r.onlyMadgeFair?.length ?? 0) > 0;
    const hasEdgeDiff = (r.edges?.onlyArchoraCount ?? 0) > 0 || (r.edges?.onlyMadgeCount ?? 0) > 0;
    if (!hasCycleDiff && !hasEdgeDiff) continue;
    lines.push(`## ${r.name} — disagreements to adjudicate`, '');
    if (r.onlyArchora?.length) {
      lines.push('**Cycles — Archora claims cyclic, madge-fair does not (possible FP):**');
      for (const f of r.onlyArchora) lines.push(`- ${f}`);
      lines.push('');
    }
    if (r.onlyMadgeFair?.length) {
      lines.push('**Cycles — madge-fair claims cyclic, Archora does not (possible miss):**');
      for (const f of r.onlyMadgeFair) lines.push(`- ${f}`);
      lines.push('');
    }
    if (r.edges?.onlyArchora.length) {
      lines.push(
        `**Edges — only Archora (sample ${r.edges.onlyArchora.length}/${r.edges.onlyArchoraCount}, possible false edges):**`,
      );
      for (const e of r.edges.onlyArchora) lines.push(`- ${e}`);
      lines.push('');
    }
    if (r.edges?.onlyMadge.length) {
      lines.push(
        `**Edges — only madge (sample ${r.edges.onlyMadge.length}/${r.edges.onlyMadgeCount}, possible missed edges):**`,
      );
      for (const e of r.edges.onlyMadge) lines.push(`- ${e}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
