import { analyze, suggestContracts, loadArchoraConfig } from '@archora/core';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, type ParsedArgv } from '../argv';
import { resolveProjectPath } from './analyze';

/**
 * `archora suggest <subcommand> <path>`
 *
 * Right now the only sub is `contracts`: walks the project, runs the analyzer,
 * and prints a `.archora.json -> contracts` block to stdout. Suggestions
 * already present in the loaded config are filtered out. Output is JSON,
 * pipe to `jq` or paste straight into `.archora.json`.
 */
export async function runSuggest(parsed: ParsedArgv): Promise<number> {
  const sub = parsed.positional[0];
  if (sub !== 'contracts') {
    process.stderr.write(
      `error: unknown suggest subcommand "${sub ?? ''}". Supported: contracts.\n`,
    );
    return 2;
  }

  // Project path is the second positional (`suggest contracts [path]`); fall
  // back to cwd. Reuse `resolveProjectPath` by faking the positional slot.
  const projectPath = resolveProjectPath({
    ...parsed,
    positional: parsed.positional.slice(1),
  });
  const quiet = flagBool(parsed, 'quiet');

  if (!quiet) console.error(`Scanning ${projectPath} \u2026`);

  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const [scan, config] = await Promise.all([analyze(source), loadArchoraConfig(source)]);

  const result = suggestContracts({
    modules: scan.modules,
    edges: scan.edges,
    cycles: scan.cycles,
    ...(config.contracts ? { existing: config.contracts } : {}),
  });

  // Sort rules by name for stable output across runs.
  if (result.contracts.boundaries) {
    result.contracts.boundaries = [...result.contracts.boundaries].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
  if (result.contracts.budgets) {
    result.contracts.budgets = [...result.contracts.budgets].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  process.stdout.write(JSON.stringify(result, null, 2));
  process.stdout.write('\n');

  if (!quiet) {
    const b = result.contracts.boundaries?.length ?? 0;
    const bg = result.contracts.budgets?.length ?? 0;
    if (b + bg === 0) {
      console.error('No new rules to suggest. Existing config already covers what we observe.');
    } else {
      console.error(`Suggested ${b} boundary rule(s) and ${bg} budget(s).`);
    }
  }
  return 0;
}
