// Node-only thin wrapper around `git log`. Browsers can't shell out, so this
// module is imported lazily by Node consumers (CLI, optional Tauri bridge).
// Keeping the spawn isolated here means `parseGitLog` and `computeChurn`
// stay pure and trivially testable.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGitLog } from './parseGitLog';
import type { GitHistory } from './types';

export interface ReadGitHistoryOptions {
  /** Repo root. We require `<root>/.git` to exist. */
  rootPath: string;
  /** Lookback window. Either a parseable git `--since` string ("90 days ago",
   *  ISO date) or a relative shorthand we expand: "90d", "12w", "6m", "1y". */
  since?: string;
  /**
   * Hard cap on commits, applied by git via `--max-count`. 0/undefined means
   * no cap. Useful on monorepos where 90 days = 50k commits and parsing eats
   * memory.
   */
  maxCommits?: number;
  /** Include merge commits? Default: false. Merges inflate temporal coupling
   *  noise without adding signal for Archora. */
  includeMerges?: boolean;
  /** Override the git executable (mostly for tests/CI). */
  gitBin?: string;
}

const DEFAULT_SINCE = '90d';

const FORMAT = '__FS_COMMIT__\x01%H\x01%h\x01%aN\x01%aE\x01%aI\x01%s';

export class GitNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitNotAvailableError';
  }
}

/**
 * Run `git log` against `rootPath` and parse the output. Throws
 * `GitNotAvailableError` when the path is not a git repo or git is missing.
 * All other errors propagate as-is.
 */
export async function readGitHistory(options: ReadGitHistoryOptions): Promise<GitHistory> {
  const { rootPath } = options;
  if (!existsSync(join(rootPath, '.git'))) {
    throw new GitNotAvailableError(`Not a git repository: ${rootPath}`);
  }
  const since = expandSince(options.since ?? DEFAULT_SINCE);
  const args: string[] = [
    'log',
    '--no-merges',
    '--numstat',
    '--date=iso-strict',
    `--pretty=format:${FORMAT}`,
    `--since=${since}`,
  ];
  if (options.includeMerges) {
    // Replace `--no-merges` with nothing.
    const idx = args.indexOf('--no-merges');
    if (idx !== -1) args.splice(idx, 1);
  }
  if (options.maxCommits && options.maxCommits > 0) {
    args.push(`--max-count=${options.maxCommits}`);
  }

  const stdout = await runGit(options.gitBin ?? 'git', args, rootPath);
  const commits = parseGitLog(stdout);
  const until = new Date().toISOString();
  return {
    since,
    until,
    commits,
    includesMerges: !!options.includeMerges,
  };
}

const SHORTHAND_RE = /^(\d+)([dwmy])$/u;

export function expandSince(input: string): string {
  const m = SHORTHAND_RE.exec(input.trim());
  if (!m) return input;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'd':
      return `${n} days ago`;
    case 'w':
      return `${n} weeks ago`;
    case 'm':
      return `${n} months ago`;
    case 'y':
      return `${n} years ago`;
    default:
      return input;
  }
}

function runGit(gitBin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(gitBin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new GitNotAvailableError(`git executable not found (tried "${gitBin}").`));
        return;
      }
      reject(err);
    });
    child.on('close', (exit) => {
      if (exit !== 0) {
        reject(new Error(`git log failed (exit ${exit}): ${stderr.trim() || 'unknown error'}`));
        return;
      }
      resolve(stdout);
    });
  });
}
