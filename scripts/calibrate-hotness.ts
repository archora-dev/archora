// Calibration check for the hotness heuristic (plan K1).
//
// The hotness weights (coupling × cycle-multiplier × sizeFactor) are justified
// ordinally; this script validates them against a DATA proxy for "pain": git
// churn (how often a module is edited). If hot modules are also high-churn, the
// heuristic tracks reality rather than being tuned by feel. We report a Spearman
// rank correlation — robust to the non-linear scales involved.
//
//   npm run calibrate:hotness            # this repo, packages/core/src
//   npm run calibrate:hotness -- <path>  # any git repo path

import path from 'node:path';
import { analyze } from '../packages/core/src/analyzer/index';
import { createNodeFsFileSource } from '../packages/core/src/analyzer/sources/nodeFsFileSource';
import { readGitHistory } from '../packages/core/src/git/readGitHistory';
import { computeChurn } from '../packages/core/src/git/computeChurn';

function spearman(pairs: Array<[number, number]>): number {
  const n = pairs.length;
  if (n < 3) return NaN;
  const rank = (values: number[]): number[] => {
    const idx = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array<number>(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      const avg = (i + j) / 2 + 1; // average rank for ties (1-based)
      for (let k = i; k <= j; k++) ranks[idx[k]![1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy);
}

async function main(): Promise<void> {
  // Scan the repo root so module ids are repo-root-relative and line up with the
  // paths git emits — that is what computeChurn keys on.
  const root = path.resolve(process.argv[2] ?? '.');

  const source = await createNodeFsFileSource({ rootPath: root });
  const scan = await analyze(source);
  const history = await readGitHistory({ rootPath: root, since: '2y' });
  const churn = computeChurn({ modules: scan.modules, history });

  const pairs: Array<[number, number]> = [];
  for (const m of scan.modules) {
    const hot = scan.metrics[m.id]?.hotnessScore ?? 0;
    const c = churn[m.id]?.commits ?? 0;
    if (c > 0) pairs.push([hot, c]);
  }

  const rho = spearman(pairs);
  console.log(`[calibrate:hotness] scanned ${root} — ${scan.modules.length} modules`);
  console.log(`  modules with churn history: ${pairs.length}`);
  console.log(`  Spearman(hotnessScore, churn commits) = ${rho.toFixed(3)}`);
  const verdict =
    rho >= 0.5
      ? 'strong positive — hotness tracks the data proxy for pain'
      : rho >= 0.2
        ? 'positive — hotness aligns with churn'
        : rho >= 0
          ? 'weak — review weights'
          : 'negative — weights anti-correlated, investigate';
  console.log(`  verdict: ${verdict}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
