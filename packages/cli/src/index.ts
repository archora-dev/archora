#!/usr/bin/env node
import { parseArgv } from './argv';
import { runScan } from './commands/scan';
import { runAnalyze } from './commands/analyze';
import { runCache } from './commands/cache';
import { runDiff } from './commands/diff';
import { runReport } from './commands/report';
import { runCheck } from './commands/check';
import { runWatch } from './commands/watch';
import { runSuggest } from './commands/suggest';
import { runMatrix } from './commands/matrix';
import { runImpact } from './commands/impact';
import { runExplain } from './commands/explain';
import { runReview } from './commands/review';
import { runOwnership } from './commands/ownership';
import { runSemantic } from './commands/semantic';
import { runHygiene } from './commands/hygiene';
import { runTrend } from './commands/trend';
import { runInit } from './commands/init';
import { runBaseline } from './commands/baseline';
import { runLicense } from './commands/license';
import { requireCommercialLicense } from './license';
import { requiresPro } from './lib/commandGating';

const HELP = `archora - architectural analysis CLI

Usage:
  archora [command] [path] [options]

Run with no command to scan the working directory and print the top problems.

Commands:
  scan    <path>            Zero-config overview: grade + "fix this first" (default).
  init    <path>            Create a conservative .archora.json starter config.
  baseline write <path>     Write an analyzer snapshot for future --base checks.
  analyze <path>            Run analysis, output JSON envelope.
  diff    <path> --base F   Diff against baseline JSON snapshot.
  report  <path>            Render report (--format md|html|junit|json|fix-plan).
  check   <path>            Exit non-zero when --fail-on rules trip.
  ci      <path>            Alias for check; intended for CI config readability.
  matrix  <path>            Render dependency matrix (--group-by area|layer|folder|package).
  impact  <path> --module M Explain direct and transitive impact for a module.
  explain <path>            Explain a signal, cycle, module, or project summary.
  review  <path>            Summarize release/PR architecture risk.
  ownership <path>          Show risky ownership areas and drift candidates.
  semantic <path>           Show public API and type/schema surface risks.
  hygiene <path>            Show lifecycle cleanup and entry-point hygiene.
  trend   <path> --base F   Compare architecture debt trend against baseline.
  watch   <path>            Re-run analysis on every change (NDJSON output).
  cache   <subcommand>      Manage persistent cache (clear|info, [--all]).
  suggest <subcommand>      Auto-suggest contract rules (subcommand: contracts).
  license <subcommand>      Manage signed local license keys (activate|status|request|remove).

Common options:
  --output, -o <file>       Write to file instead of stdout.
  --base <file>             Baseline JSON snapshot (diff/report/check).
  --format <format>         report: md|html|junit|json|fix-plan; views: json|md.
  --input <file>            matrix/impact/explain: read an existing scan JSON.
  --group-by <kind>         Matrix grouping: area|layer|folder|package (default: area).
  --only-violations         Matrix: show only cells with rule violations.
  --only-cycles             Matrix: show only cells touching cycle edges.
  --top <N>                 Matrix/impact markdown list cap.
  --module <module-id>      Module target for impact/explain.
  --signal <stable-key>     Signal target for explain.
  --cycle <cycle-id>        Cycle target for explain.
  --bundle-stats <file>     Webpack stats.json or rollup-plugin-visualizer JSON.
  --pr-comment              review: compact Markdown with stable update markers.
  --changed-files <paths>   review: comma-separated changed module paths for PR focus.
  --git-history             Read git log into the scan (per-module churn).
  --git-since <window>      Lookback window for --git-history (default: 90d).
                            Accepts: Nd, Nw, Nm, Ny, ISO date, or any --since string.
  --cache / --no-cache      Use persistent cache for analyze/watch (default on).
  --dry-run                 init: print the proposed config without writing.
  --force                   init: overwrite an existing .archora.json.
  --key <key>               license activate: key value (or pass it as positional).
  --plan <plan>             license request: trial|solo|team|company.
  --json                    license: print machine-readable JSON.
  --quiet                   Suppress progress messages on stderr.
  --help, -h                Show this help.

check rules (repeatable):
  --fail-on grade:D
  --fail-on cycles:0
  --fail-on layer-violations:0
  --fail-on recommendations:5
  --fail-on contract-violations:0   (uses .archora.json contracts block)
  --fail-on contract-errors:0       (only error-severity contract rules)
  --fail-on bundle-bloat:high       (use with --bundle-stats; high|medium|low)
  --fail-on signals:high            (CI-safe stable/high-confidence signals only)
  --fail-on new-signals:high        (requires --base)
  --fail-on regressed-signals:high  (requires --base)
  --fail-on new-cycles:0              (requires --base)
  --fail-on new-layer-violations:0    (requires --base)
  --fail-on new-contract-violations:0 (requires --base)

Examples:
  archora                   (scan the current directory, show top problems)
  archora scan ./app
  archora analyze . > scan.json
  archora init . --dry-run
  archora init .
  archora baseline write . -o .archora/baseline.json
  archora check .
  archora check . --fail-on grade:D --fail-on cycles:0
  archora ci . --fail-on signals:high --base scan.json
  archora report . --format md -o report.md
  archora diff . --base scan.json -o diff.json
  archora matrix --input scan.json --format md
  archora impact --input scan.json --module src/features/auth/model/session.ts --format md
  archora explain --input scan.json --base baseline.json --signal contract:auth --format md
  archora review --input scan.json --format md
  archora review --input scan.json --base baseline.json --pr-comment --changed-files src/features/auth/model/session.ts
  archora ownership . --format md
  archora semantic . --format md
  archora hygiene --input scan.json --format md
  archora trend --input scan.json --base previous-scan.json --format md
  archora license request --plan trial --out license-request.md
  archora license activate <license-key>
  archora license status
`;

async function main(): Promise<number> {
  const parsed = parseArgv(process.argv.slice(2));
  if (parsed.flags['help'] === true || parsed.flags['h'] === true) {
    process.stdout.write(HELP);
    return 0;
  }
  // No command -> zero-config overview of the working directory. The first run
  // should show value, not a wall of usage text (that lives behind --help).
  if (parsed.command === '') {
    return runScan(parsed);
  }
  if (requiresPro(parsed.command)) {
    await requireCommercialLicense(parsed.command);
  }
  switch (parsed.command) {
    case 'scan':
    case 'overview':
      return runScan(parsed);
    case 'init':
      return runInit(parsed);
    case 'baseline':
      return runBaseline(parsed);
    case 'license':
      return runLicense(parsed);
    case 'analyze':
      return runAnalyze(parsed);
    case 'diff':
      return runDiff(parsed);
    case 'report':
      return runReport(parsed);
    case 'check':
    case 'ci':
      return runCheck(parsed);
    case 'watch':
      return runWatch(parsed);
    case 'cache':
      return runCache(parsed);
    case 'suggest':
      return runSuggest(parsed);
    case 'matrix':
      return runMatrix(parsed);
    case 'impact':
      return runImpact(parsed);
    case 'explain':
      return runExplain(parsed);
    case 'review':
      return runReview(parsed);
    case 'ownership':
      return runOwnership(parsed);
    case 'semantic':
      return runSemantic(parsed);
    case 'hygiene':
      return runHygiene(parsed);
    case 'trend':
      return runTrend(parsed);
    default:
      process.stderr.write(`error: unknown command "${parsed.command}". Run --help.\n`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    if (err instanceof Error && err.stack && process.env['FRONTSCOPE_DEBUG']) {
      process.stderr.write(`${err.stack}\n`);
    }
    process.exit(1);
  });
