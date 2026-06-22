/**
 * Differential accuracy report writer.
 *
 * Runs the shared differential (Archora vs madge) over every repo in the
 * corpus and writes the full report to
 * docs/superpowers/audits/accuracy-diff-result.{json,md}. The comparison core
 * lives in scripts/lib/accuracyDiff.ts and is shared with the release gate
 * (scripts/accuracy-gate.ts) so the two never drift apart.
 *
 * Compares both cyclic-file sets and resolved runtime edges. See the lib for
 * the methodology and the (documented) edge-comparison restriction.
 *
 * Repos are fetched as tarballs (no git). Run: vite-node scripts/accuracy-diff.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPOS, runRepo, renderMd, type RepoResult } from './lib/accuracyDiff';

async function run(): Promise<void> {
  const results: RepoResult[] = [];
  for (const spec of REPOS) {
    const r = await runRepo(spec);
    results.push(r);

    if (!r.ok) {
      console.log(`${r.name}: SKIP ${r.note}`);
    } else if (r.madgeFailed) {
      console.log(`${r.name}: archora=${r.archora} [madge FAILED — disagreements suppressed]`);
    } else {
      console.log(
        `${r.name}: archora=${r.archora} madgeFair=${r.madgeFair} madgeDefault=${r.madgeDefault}` +
          ` onlyArchora=${r.onlyArchora?.length} onlyMadgeFair=${r.onlyMadgeFair?.length}` +
          ` | edges archora=${r.edges?.archora} madge=${r.edges?.madge}` +
          ` onlyArchora=${r.edges?.onlyArchoraCount} onlyMadge=${r.edges?.onlyMadgeCount}`,
      );
    }
  }

  const outDir = path.resolve('docs/superpowers/audits');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'accuracy-diff-result.json'), JSON.stringify(results, null, 2));
  writeFileSync(path.join(outDir, 'accuracy-diff-result.md'), renderMd(results));

  console.log(`\nWrote report to ${outDir}/accuracy-diff-result.{json,md}`);
}

void run();
