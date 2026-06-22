import type { GitCommit, GitHistory } from '@/core/git/types';
import { parseGitLog } from '@/core/git/parseGitLog';
import { isTauri, tauriInvoke } from '@/shared/lib';

/**
 * Pure envelope builder. Exported so it can be unit-tested without Tauri.
 *
 * Commits are expected in reverse-chronological order (as git returns them),
 * so the first commit is the newest and the last is the oldest.
 *
 * Returns null when the commits array is empty.
 */
export function toGitHistory(commits: GitCommit[]): GitHistory | null {
  if (commits.length === 0) return null;
  // commits[0] is newest (reverse-chron), commits[last] is oldest
  const until = commits[0]!.authoredAt;
  const since = commits[commits.length - 1]!.authoredAt;
  return { since, until, commits, includesMerges: false };
}

/**
 * Load git history for `rootPath` by invoking the Rust `git_log` command.
 *
 * Returns null when:
 * - not running inside Tauri (browser-only context)
 * - git is not installed or the directory is not a repo
 * - the log is empty
 * - any error occurs during the invocation or parsing
 *
 * Never throws — a missing git history degrades gracefully to a scan
 * without churn/temporal-coupling metrics.
 */
export async function loadGitHistory(rootPath: string): Promise<GitHistory | null> {
  if (!isTauri()) return null;
  try {
    const raw = await tauriInvoke<string>('git_log', { root: rootPath });
    if (!raw) return null;
    const commits = parseGitLog(raw);
    return toGitHistory(commits);
  } catch {
    return null;
  }
}
