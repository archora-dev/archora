// Aggregate `GitHistory` into per-module churn metrics.
//
// `GitHistory` knows about repo paths, not module ids. The mapping is just
// "the path equals the moduleId" today (analyzer normalizes both to repo-
// root-relative POSIX paths), but we keep the indirection in case we ever
// stop using paths as ids.

import type { ModuleNode } from '../analyzer/types';
import type { ChurnAuthor, ChurnByModule, ChurnMetric, GitCommit, GitHistory } from './types';

export interface ComputeChurnInput {
  modules: ModuleNode[];
  history: GitHistory;
}

const TOP_AUTHORS = 5;

export function computeChurn(input: ComputeChurnInput): ChurnByModule {
  const moduleIds = new Set(input.modules.map((m) => m.id));
  // path -> aggregator. We use a map so we can also collapse renames: when
  // a commit renames `old -> new`, both paths receive the touch (the same
  // physical change happened on both names through history).
  const acc = new Map<string, AccPerModule>();

  for (const commit of input.history.commits) {
    const touchedPaths = pathsTouched(commit, moduleIds);
    for (const path of touchedPaths) {
      let entry = acc.get(path);
      if (!entry) {
        entry = makeEntry(path);
        acc.set(path, entry);
      }
      entry.commits += 1;
      entry.lines += linesIn(commit, path);
      entry.authorsByEmail.set(commit.author, (entry.authorsByEmail.get(commit.author) ?? 0) + 1);
      if (entry.lastTouchedAt < commit.authoredAt) {
        entry.lastTouchedAt = commit.authoredAt;
      }
    }
  }

  const out: ChurnByModule = {};
  for (const [path, entry] of acc) {
    out[path] = finalize(entry);
  }
  return out;
}

interface AccPerModule {
  moduleId: string;
  commits: number;
  lines: number;
  authorsByEmail: Map<string, number>;
  lastTouchedAt: string;
}

function makeEntry(moduleId: string): AccPerModule {
  return {
    moduleId,
    commits: 0,
    lines: 0,
    authorsByEmail: new Map(),
    lastTouchedAt: '',
  };
}

function pathsTouched(commit: GitCommit, validIds: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const change of commit.changes) {
    if (validIds.has(change.path)) out.add(change.path);
    // Renames: charge the old name too — its history matters for churn even
    // if the file no longer exists at HEAD.
    if (change.renamedFrom && validIds.has(change.renamedFrom)) {
      out.add(change.renamedFrom);
    }
  }
  return out;
}

function linesIn(commit: GitCommit, path: string): number {
  let sum = 0;
  for (const c of commit.changes) {
    if (c.path !== path && c.renamedFrom !== path) continue;
    if (c.added !== null) sum += c.added;
    if (c.removed !== null) sum += c.removed;
  }
  return sum;
}

function finalize(entry: AccPerModule): ChurnMetric {
  const authorsAll: ChurnAuthor[] = [...entry.authorsByEmail.entries()]
    .map(([author, commits]) => ({ author, commits }))
    .sort((a, b) => b.commits - a.commits || a.author.localeCompare(b.author));
  let authors: ChurnAuthor[];
  if (authorsAll.length <= TOP_AUTHORS) {
    authors = authorsAll;
  } else {
    const top = authorsAll.slice(0, TOP_AUTHORS);
    const rest = authorsAll.slice(TOP_AUTHORS);
    const otherCommits = rest.reduce((sum, a) => sum + a.commits, 0);
    authors = [...top, { author: '__other__', commits: otherCommits }];
  }
  return {
    moduleId: entry.moduleId,
    commits: entry.commits,
    linesChanged: entry.lines,
    authorCount: entry.authorsByEmail.size,
    lastTouchedAt: entry.lastTouchedAt,
    authors,
  };
}
