/**
 * Benchmarks runner for Archora analyzer accuracy.
 *
 * Walks `fixtures/reference/<project>/expected.json`, runs `analyze()` on the
 * sibling project root, matches insights to annotations and computes
 * precision / recall / F1 per recommendation kind.
 *
 * Output:
 *   - Console table with per-project + aggregate metrics
 *   - JSON report at `dist/benchmarks/<timestamp>.json`
 *   - Markdown table appended to `BENCHMARKS.md` (between markers)
 *
 * Usage:
 *   npm run bench                 # run all reference projects
 *   npm run bench -- vue-spa      # filter by project name
 *   npm run bench -- --update-md  # also rewrite BENCHMARKS.md table
 *   npm run bench -- --json       # print full JSON report to stdout
 *   npm run bench -- --threshold-precision=0.9  # CI gate (exit 1 on miss)
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../packages/core/src/analyzer';
import { createNodeFsFileSource } from '../packages/core/src/analyzer/sources/nodeFsFileSource';
import type { Recommendation, ScanResult } from '../packages/core/src/analyzer/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const REFERENCE_DIR = join(REPO_ROOT, 'fixtures', 'reference');
const REPORT_DIR = join(REPO_ROOT, 'dist', 'benchmarks');
const BENCHMARKS_MD = join(REPO_ROOT, 'BENCHMARKS.md');
const BENCHMARKS_TABLE_BEGIN = '<!-- BENCHMARKS:BEGIN -->';
const BENCHMARKS_TABLE_END = '<!-- BENCHMARKS:END -->';

type RecommendationKind = Recommendation['kind'];

interface AnnotatedInsight {
  kind: RecommendationKind;
  modules: string[];
  note?: string;
}

interface ExpectedFile {
  project: string;
  description?: string;
  rev?: string;
  expected: {
    truePositives?: AnnotatedInsight[];
    falsePositives?: AnnotatedInsight[];
    missed?: AnnotatedInsight[];
  };
}

interface MatchedInsight {
  insight: Recommendation;
  verdict: 'tp' | 'fp' | 'unverified';
  matched?: AnnotatedInsight;
}

interface KindMetrics {
  kind: RecommendationKind | 'overall';
  tp: number;
  fp: number;
  fn: number;
  unverified: number;
  precision: number;
  recall: number;
  f1: number;
}

interface ProjectResult {
  project: string;
  description?: string;
  rev?: string;
  expectedPath: string;
  rootPath: string;
  durationMs: number;
  totalInsights: number;
  matched: MatchedInsight[];
  unmatchedMissed: AnnotatedInsight[];
  byKind: Record<string, KindMetrics>;
  overall: KindMetrics;
}

interface BenchmarkReport {
  generatedAt: string;
  projects: ProjectResult[];
  aggregate: KindMetrics;
}

interface CliOptions {
  filter?: string;
  json?: boolean;
  updateMd?: boolean;
  thresholdPrecision?: number;
  thresholdRecall?: number;
  thresholdF1?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  for (const a of argv) {
    if (a === '--json') opts.json = true;
    else if (a === '--update-md') opts.updateMd = true;
    else if (a.startsWith('--threshold-precision=')) {
      opts.thresholdPrecision = Number.parseFloat(a.split('=')[1] ?? '0');
    } else if (a.startsWith('--threshold-recall=')) {
      opts.thresholdRecall = Number.parseFloat(a.split('=')[1] ?? '0');
    } else if (a.startsWith('--threshold-f1=')) {
      opts.thresholdF1 = Number.parseFloat(a.split('=')[1] ?? '0');
    } else if (!a.startsWith('--')) {
      opts.filter = a;
    }
  }
  return opts;
}

async function listProjects(filter?: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(REFERENCE_DIR);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(REFERENCE_DIR, entry);
    const s = await stat(full).catch(() => null);
    if (!s?.isDirectory()) continue;
    if (filter && !entry.includes(filter)) continue;
    const expectedPath = join(full, 'expected.json');
    if (!(await stat(expectedPath).catch(() => null))) continue;
    out.push(full);
  }
  return out.sort();
}

async function readExpected(rootPath: string): Promise<ExpectedFile> {
  const raw = await readFile(join(rootPath, 'expected.json'), 'utf-8');
  const parsed = JSON.parse(raw) as ExpectedFile;
  parsed.expected.truePositives ??= [];
  parsed.expected.falsePositives ??= [];
  parsed.expected.missed ??= [];
  return parsed;
}

/**
 * Match an analyzer-emitted insight to an annotation.
 *
 * Rule: same `kind`, and the annotation's module set intersects with the
 * insight's module set. Annotations may list a small "hint" subset of modules
 * (e.g. cluster representatives) - we don't require full overlap.
 */
function matches(insight: Recommendation, annotation: AnnotatedInsight): boolean {
  if (insight.kind !== annotation.kind) return false;
  if (annotation.modules.length === 0) return true;
  const set = new Set(insight.modules);
  return annotation.modules.some((m) => set.has(m));
}

function classifyInsight(
  insight: Recommendation,
  expected: ExpectedFile['expected'],
): MatchedInsight {
  for (const ann of expected.truePositives ?? []) {
    if (matches(insight, ann)) return { insight, verdict: 'tp', matched: ann };
  }
  for (const ann of expected.falsePositives ?? []) {
    if (matches(insight, ann)) return { insight, verdict: 'fp', matched: ann };
  }
  return { insight, verdict: 'unverified' };
}

function computeKindMetrics(
  kind: KindMetrics['kind'],
  matched: MatchedInsight[],
  missed: AnnotatedInsight[],
  unverifiedAsFp: boolean,
): KindMetrics {
  const subset = kind === 'overall' ? matched : matched.filter((m) => m.insight.kind === kind);
  const subsetMissed = kind === 'overall' ? missed : missed.filter((m) => m.kind === kind);
  let tp = 0;
  let fp = 0;
  let unverified = 0;
  for (const m of subset) {
    if (m.verdict === 'tp') tp++;
    else if (m.verdict === 'fp') fp++;
    else unverified++;
  }
  const fn = subsetMissed.length;
  const fpEffective = unverifiedAsFp ? fp + unverified : fp;
  const precision = tp + fpEffective === 0 ? 1 : tp / (tp + fpEffective);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { kind, tp, fp, fn, unverified, precision, recall, f1 };
}

async function runProject(rootPath: string): Promise<ProjectResult> {
  const expected = await readExpected(rootPath);
  const start = Date.now();
  const source = await createNodeFsFileSource({ rootPath });
  const result: ScanResult = await analyze(source);
  const durationMs = Date.now() - start;

  const matched = result.recommendations.map((insight) =>
    classifyInsight(insight, expected.expected),
  );
  const unmatchedMissed = (expected.expected.missed ?? []).filter(
    (m) => !result.recommendations.some((insight) => matches(insight, m)),
  );

  const kinds: RecommendationKind[] = [
    'split-god-module',
    'unused-utility',
    'cycle-break-candidate',
    'misplaced-by-layer',
    'isolated-cluster',
  ];
  const byKind: Record<string, KindMetrics> = {};
  for (const k of kinds) {
    byKind[k] = computeKindMetrics(k, matched, unmatchedMissed, true);
  }
  const overall = computeKindMetrics('overall', matched, unmatchedMissed, true);

  return {
    project: expected.project,
    ...(expected.description !== undefined ? { description: expected.description } : {}),
    ...(expected.rev !== undefined ? { rev: expected.rev } : {}),
    expectedPath: join(rootPath, 'expected.json'),
    rootPath,
    durationMs,
    totalInsights: result.recommendations.length,
    matched,
    unmatchedMissed,
    byKind,
    overall,
  };
}

function aggregateAcrossProjects(projects: ProjectResult[]): KindMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let unverified = 0;
  for (const p of projects) {
    tp += p.overall.tp;
    fp += p.overall.fp;
    fn += p.overall.fn;
    unverified += p.overall.unverified;
  }
  const fpEffective = fp + unverified;
  const precision = tp + fpEffective === 0 ? 1 : tp / (tp + fpEffective);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { kind: 'overall', tp, fp, fn, unverified, precision, recall, f1 };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function formatConsole(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Archora Benchmarks - ${report.generatedAt}`);
  lines.push('');

  for (const p of report.projects) {
    lines.push(`# ${p.project}${p.description ? ' - ' + p.description : ''}`);
    lines.push(`  rev: ${p.rev ?? '-'}, insights: ${p.totalInsights}, took ${p.durationMs}ms`);
    lines.push('');
    lines.push(
      `    ${pad('kind', 24)} ${pad('TP', 4)} ${pad('FP', 4)} ${pad('FN', 4)} ${pad('Unv', 4)} ${pad('Prec', 8)} ${pad('Rec', 8)} ${pad('F1', 8)}`,
    );
    for (const k of Object.keys(p.byKind)) {
      const m = p.byKind[k]!;
      const total = m.tp + m.fp + m.fn + m.unverified;
      if (total === 0) continue;
      lines.push(
        `    ${pad(k, 24)} ${pad(String(m.tp), 4)} ${pad(String(m.fp), 4)} ${pad(String(m.fn), 4)} ${pad(String(m.unverified), 4)} ${pad(pct(m.precision), 8)} ${pad(pct(m.recall), 8)} ${pad(pct(m.f1), 8)}`,
      );
    }
    lines.push(
      `    ${pad('OVERALL', 24)} ${pad(String(p.overall.tp), 4)} ${pad(String(p.overall.fp), 4)} ${pad(String(p.overall.fn), 4)} ${pad(String(p.overall.unverified), 4)} ${pad(pct(p.overall.precision), 8)} ${pad(pct(p.overall.recall), 8)} ${pad(pct(p.overall.f1), 8)}`,
    );

    if (p.matched.some((m) => m.verdict === 'unverified')) {
      lines.push('');
      lines.push('    ⚠ unverified insights (annotate in expected.json):');
      for (const m of p.matched) {
        if (m.verdict !== 'unverified') continue;
        const sample = m.insight.modules.slice(0, 3).join(', ');
        lines.push(
          `      - [${m.insight.kind}] ${sample}${m.insight.modules.length > 3 ? '…' : ''}`,
        );
      }
    }
    if (p.unmatchedMissed.length > 0) {
      lines.push('');
      lines.push('    ✗ missed (analyzer did not produce):');
      for (const m of p.unmatchedMissed) {
        const sample = m.modules.slice(0, 3).join(', ');
        lines.push(`      - [${m.kind}] ${sample}${m.note ? ' - ' + m.note : ''}`);
      }
    }
    lines.push('');
  }

  const a = report.aggregate;
  lines.push('═══ AGGREGATE ═══');
  lines.push(
    `  TP=${a.tp}  FP=${a.fp}  FN=${a.fn}  Unverified=${a.unverified}  ` +
      `Precision=${pct(a.precision)}  Recall=${pct(a.recall)}  F1=${pct(a.f1)}`,
  );
  lines.push('');
  return lines.join('\n');
}

function formatMarkdownTable(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`<!-- generated by scripts/run-benchmarks.ts at ${report.generatedAt} -->`);
  lines.push('');
  lines.push('| Project | TP | FP | FN | Unv | Precision | Recall | F1 |');
  lines.push('|---|--:|--:|--:|--:|--:|--:|--:|');
  for (const p of report.projects) {
    const m = p.overall;
    lines.push(
      `| \`${p.project}\` | ${m.tp} | ${m.fp} | ${m.fn} | ${m.unverified} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} |`,
    );
  }
  const a = report.aggregate;
  lines.push(
    `| **aggregate** | **${a.tp}** | **${a.fp}** | **${a.fn}** | **${a.unverified}** | **${pct(a.precision)}** | **${pct(a.recall)}** | **${pct(a.f1)}** |`,
  );
  return lines.join('\n');
}

async function maybeUpdateMarkdown(report: BenchmarkReport): Promise<void> {
  let existing = '';
  try {
    existing = await readFile(BENCHMARKS_MD, 'utf-8');
  } catch {
    // File does not exist yet - nothing to update.
    return;
  }
  const begin = existing.indexOf(BENCHMARKS_TABLE_BEGIN);
  const end = existing.indexOf(BENCHMARKS_TABLE_END);
  if (begin === -1 || end === -1 || end < begin) return;
  const before = existing.slice(0, begin + BENCHMARKS_TABLE_BEGIN.length);
  const after = existing.slice(end);
  const next = `${before}\n\n${formatMarkdownTable(report)}\n\n${after}`;
  await writeFile(BENCHMARKS_MD, next, 'utf-8');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const projectDirs = await listProjects(opts.filter);
  if (projectDirs.length === 0) {
    console.error(
      `No reference projects found in ${REFERENCE_DIR}` +
        (opts.filter ? ` matching "${opts.filter}"` : '') +
        '. Each project needs an expected.json next to its sources.',
    );
    process.exit(2);
  }

  const projects: ProjectResult[] = [];
  for (const dir of projectDirs) {
    try {
      projects.push(await runProject(dir));
    } catch (err) {
      console.error(`Failed to run ${dir}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    projects,
    aggregate: aggregateAcrossProjects(projects),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatConsole(report));
  }

  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  await writeFile(join(REPORT_DIR, `${stamp}.json`), JSON.stringify(report, null, 2), 'utf-8');

  if (opts.updateMd) {
    await maybeUpdateMarkdown(report);
  }

  // CI gate
  let failed = false;
  if (
    opts.thresholdPrecision !== undefined &&
    report.aggregate.precision < opts.thresholdPrecision
  ) {
    console.error(
      `\n✗ Precision ${pct(report.aggregate.precision)} below threshold ${pct(opts.thresholdPrecision)}`,
    );
    failed = true;
  }
  if (opts.thresholdRecall !== undefined && report.aggregate.recall < opts.thresholdRecall) {
    console.error(
      `\n✗ Recall ${pct(report.aggregate.recall)} below threshold ${pct(opts.thresholdRecall)}`,
    );
    failed = true;
  }
  if (opts.thresholdF1 !== undefined && report.aggregate.f1 < opts.thresholdF1) {
    console.error(`\n✗ F1 ${pct(report.aggregate.f1)} below threshold ${pct(opts.thresholdF1)}`);
    failed = true;
  }
  if (failed) process.exit(1);
}

void main();
