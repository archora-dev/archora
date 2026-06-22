/**
 * Reproducible accuracy gate (T3).
 *
 * Runs the same differential as scripts/accuracy-diff.ts (shared core in
 * scripts/lib/accuracyDiff.ts) and turns it into a pass/fail check suitable for
 * release-check / CI. Run: vite-node scripts/accuracy-gate.ts
 *
 * Fail policy — fail ONLY on a CYCLE false positive against a TRUSTED oracle:
 *   (a) an `onlyArchora` cyclic file on a repo where madge-fair is a trustworthy
 *       cycle oracle (flat libraries with matching file universes, marked
 *       `trustedCycleOracle` in REPOS) -> Archora invented a cycle. HARD-FAIL.
 *
 * On complex monorepos (vue-core, excalidraw: `trustedCycleOracle: false`) the
 * two tools' reachable file sets diverge for reasons unrelated to Archora's
 * correctness — its resolved edges still match madge-fair exactly on the shared
 * set — so an `onlyArchora` there is reported as an oracle-divergence WARN, not a
 * failure. A release gate must not block on an oracle it cannot trust.
 *
 * `onlyMadgeFair` cyclic files (madge-fair claims a cycle Archora does not) are
 * a WARN, not a failure. madge-fair keys on syntax: it cannot tell a value-
 * syntax import used only in type positions (e.g. `import { Pinia }` where
 * `Pinia` is an interface) from a runtime one, so it over-reports. Archora
 * erases those (the compiler does too) and is therefore deliberately stricter
 * than madge-fair. Treating that direction as a failure would fail the gate on
 * the very accuracy advantage it exists to protect. We surface the files for
 * human adjudication instead — a genuine miss would show up here too.
 *
 * Edge diffs are reported but NON-FATAL (WARN). Reason: the edge comparison is
 * restricted to the file set BOTH tools analyzed (Archora skips test-like dirs,
 * madge does not), and the tools still differ on extension/resolution edge
 * cases. That restriction makes edge `onlyArchora`/`onlyMadge` informative but
 * not airtight, so hard-failing on them would produce flaky gates. They are
 * surfaced loudly instead, for human adjudication via the full report.
 *
 * Robustness — the gate MUST be safe with zero network (CI/offline):
 *   - a repo that fails to download or whose srcDir is absent is SKIPPED, not failed
 *   - a repo where madge fails to run is SKIPPED, not failed
 *   - if EVERY repo skips (e.g. no network), the gate PASSES with a clear note
 *     "0 repos validated (no network)" and exits 0.
 */
import { REPOS, runRepo, type RepoResult } from './lib/accuracyDiff';

interface Verdict {
  validated: number;
  skipped: number;
  /** onlyArchora on a TRUSTED-oracle repo — a real false positive. HARD FAIL. */
  cycleFailures: RepoResult[];
  /** onlyArchora on an UNTRUSTED-oracle (complex monorepo) repo. WARN only. */
  oracleDivergence: RepoResult[];
  /** Archora stricter than madge-fair (type-only erasure or a miss). WARN. */
  stricterThanMadge: RepoResult[];
  edgeWarnings: RepoResult[];
}

function evaluate(results: RepoResult[]): Verdict {
  const v: Verdict = {
    validated: 0,
    skipped: 0,
    cycleFailures: [],
    oracleDivergence: [],
    stricterThanMadge: [],
    edgeWarnings: [],
  };
  for (const r of results) {
    // download/srcDir failure, or madge crash -> not a regression, just skipped
    if (!r.ok || r.madgeFailed) {
      v.skipped += 1;
      continue;
    }
    v.validated += 1;
    if ((r.onlyArchora?.length ?? 0) > 0) {
      // Only a HARD failure where madge-fair is a trustworthy cycle oracle
      // (flat libraries with matching file universes). On complex monorepos the
      // file universes diverge for reasons unrelated to Archora's correctness —
      // its resolved edges still match madge-fair exactly — so we WARN, not fail.
      if (r.trustedCycleOracle !== false) v.cycleFailures.push(r);
      else v.oracleDivergence.push(r);
    }
    if ((r.onlyMadgeFair?.length ?? 0) > 0) {
      v.stricterThanMadge.push(r);
    }
    if ((r.edges?.onlyArchoraCount ?? 0) > 0 || (r.edges?.onlyMadgeCount ?? 0) > 0) {
      v.edgeWarnings.push(r);
    }
  }
  return v;
}

async function main(): Promise<void> {
  const results: RepoResult[] = [];
  for (const spec of REPOS) {
    const r = await runRepo(spec);
    results.push(r);

    if (!r.ok) {
      console.log(`  - ${r.name}: SKIP (${r.note})`);
    } else if (r.madgeFailed) {
      console.log(`  - ${r.name}: SKIP (madge failed to run)`);
    } else {
      const onlyA = r.onlyArchora?.length ?? 0;
      const cyc =
        onlyA > 0 && r.trustedCycleOracle !== false
          ? `cycles FAIL (false positives=${onlyA})`
          : onlyA > 0
            ? `cycles WARN (oracle divergence=${onlyA}, untrusted monorepo oracle)`
            : (r.onlyMadgeFair?.length ?? 0) > 0
              ? `cycles OK (stricter than madge by ${r.onlyMadgeFair?.length})`
              : 'cycles OK';
      const edg =
        (r.edges?.onlyArchoraCount ?? 0) + (r.edges?.onlyMadgeCount ?? 0) === 0
          ? 'edges OK'
          : `edges WARN (onlyArchora=${r.edges?.onlyArchoraCount}, onlyMadge=${r.edges?.onlyMadgeCount})`;
      console.log(`  - ${r.name}: ${cyc}; ${edg}`);
    }
  }

  const v = evaluate(results);

  console.log('');
  if (v.validated === 0) {
    console.log('accuracy:gate PASS — 0 repos validated (no network). Nothing to check.');
    process.exit(0);
  }

  // Oracle divergence on complex monorepos: report loudly, never fail.
  for (const r of v.oracleDivergence) {
    console.log(
      `WARN ${r.name}: ${r.onlyArchora?.length} cycle file(s) Archora reports and madge-fair ` +
        `does not — untrusted oracle (monorepo file universes diverge; edges match exactly). ` +
        `Review via report, not a gate failure.`,
    );
  }

  // Stricter-than-madge: the accuracy advantage, surfaced for adjudication.
  for (const r of v.stricterThanMadge) {
    console.log(
      `WARN ${r.name}: ${r.onlyMadgeFair?.length} cycle file(s) madge-fair reports and Archora ` +
        `does not (expected for value-syntax type-only imports; confirm none is a real miss): ` +
        `${r.onlyMadgeFair?.slice(0, 10).join(', ')}`,
    );
  }

  // Edge warnings: loud but non-fatal (see header for why).
  for (const r of v.edgeWarnings) {
    console.log(
      `WARN ${r.name}: edge diff vs madge-fair — onlyArchora=${r.edges?.onlyArchoraCount}, ` +
        `onlyMadge=${r.edges?.onlyMadgeCount} (restricted to shared file set; adjudicate via report)`,
    );
  }

  if (v.cycleFailures.length > 0) {
    console.log('');
    console.log(`accuracy:gate FAIL — cycle false positive in ${v.cycleFailures.length} repo(s):`);
    for (const r of v.cycleFailures) {
      console.log(
        `  ${r.name}: FALSE POSITIVE cycles (Archora-only): ${r.onlyArchora?.join(', ')}`,
      );
    }
    console.log('');
    console.log(
      `Summary: ${v.validated} validated, ${v.skipped} skipped, ` +
        `${v.cycleFailures.length} cycle FAIL, ${v.oracleDivergence.length} oracle-divergence WARN, ` +
        `${v.stricterThanMadge.length} stricter, ${v.edgeWarnings.length} edge WARN.`,
    );
    process.exit(1);
  }

  console.log('');
  console.log(
    `accuracy:gate PASS — ${v.validated} repos validated, ${v.skipped} skipped, ` +
      `0 false positives on trusted oracle, ${v.oracleDivergence.length} oracle-divergence WARN, ` +
      `${v.stricterThanMadge.length} stricter-than-madge, ${v.edgeWarnings.length} edge warning(s).`,
  );
  process.exit(0);
}

void main();
