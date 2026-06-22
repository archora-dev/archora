import { describe, expect, it } from 'vitest';
import { computeChurn } from '../computeChurn';
import type { GitCommit, GitHistory } from '../types';
import type { ModuleNode } from '../../analyzer/types';

function mod(id: string): ModuleNode {
  return {
    id,
    absPath: id,
    kind: 'unknown',
    language: 'ts',
    loc: 10,
    exports: [],
    isInfra: false,
  };
}

function commit(
  sha: string,
  email: string,
  date: string,
  changes: Array<{ path: string; added: number; removed: number; renamedFrom?: string }>,
): GitCommit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    author: email,
    authorName: email,
    authoredAt: date,
    subject: sha,
    changes: changes.map((c) => ({
      path: c.path,
      added: c.added,
      removed: c.removed,
      ...(c.renamedFrom ? { renamedFrom: c.renamedFrom } : {}),
    })),
  };
}

function history(commits: GitCommit[]): GitHistory {
  return { since: '90d', until: 'now', commits, includesMerges: false };
}

describe('computeChurn', () => {
  it('counts commits, lines, authors per module', () => {
    const modules = [mod('src/a.ts'), mod('src/b.ts')];
    const h = history([
      commit('1', 'alice@x.com', '2026-05-01T10:00:00Z', [
        { path: 'src/a.ts', added: 5, removed: 2 },
      ]),
      commit('2', 'bob@x.com', '2026-05-03T10:00:00Z', [
        { path: 'src/a.ts', added: 1, removed: 0 },
        { path: 'src/b.ts', added: 3, removed: 1 },
      ]),
      commit('3', 'alice@x.com', '2026-05-05T10:00:00Z', [
        { path: 'src/a.ts', added: 0, removed: 4 },
      ]),
    ]);
    const churn = computeChurn({ modules, history: h });
    expect(churn['src/a.ts']?.commits).toBe(3);
    expect(churn['src/a.ts']?.linesChanged).toBe(5 + 2 + 1 + 0 + 4);
    expect(churn['src/a.ts']?.authorCount).toBe(2);
    expect(churn['src/a.ts']?.lastTouchedAt).toBe('2026-05-05T10:00:00Z');
    expect(churn['src/b.ts']?.commits).toBe(1);
    expect(churn['src/b.ts']?.authorCount).toBe(1);
  });

  it('sorts authors by commit count desc and collapses past top 5', () => {
    const modules = [mod('src/a.ts')];
    const ppl = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const counts = [10, 5, 5, 3, 2, 2, 1];
    const commits: GitCommit[] = [];
    let n = 0;
    for (let i = 0; i < ppl.length; i++) {
      for (let j = 0; j < counts[i]!; j++) {
        commits.push(
          commit(`${++n}`.padStart(7, '0'), `${ppl[i]}@x.com`, '2026-01-01T00:00:00Z', [
            { path: 'src/a.ts', added: 1, removed: 0 },
          ]),
        );
      }
    }
    const churn = computeChurn({ modules, history: history(commits) });
    const authors = churn['src/a.ts']?.authors ?? [];
    expect(authors).toHaveLength(6); // top 5 + __other__
    expect(authors[0]).toEqual({ author: 'a@x.com', commits: 10 });
    expect(authors[5]).toEqual({ author: '__other__', commits: 2 + 1 }); // f+g
  });

  it('charges renames against both old and new paths', () => {
    const modules = [mod('src/old.ts'), mod('src/new.ts')];
    const h = history([
      commit('1', 'a@x', '2026-05-01T10:00:00Z', [
        { path: 'src/new.ts', renamedFrom: 'src/old.ts', added: 0, removed: 0 },
      ]),
    ]);
    const churn = computeChurn({ modules, history: h });
    expect(churn['src/old.ts']?.commits).toBe(1);
    expect(churn['src/new.ts']?.commits).toBe(1);
  });

  it('skips paths that are not in the modules set', () => {
    const modules = [mod('src/a.ts')];
    const h = history([
      commit('1', 'a@x', '2026-05-01T10:00:00Z', [
        { path: 'src/a.ts', added: 1, removed: 0 },
        { path: 'README.md', added: 5, removed: 0 },
      ]),
    ]);
    const churn = computeChurn({ modules, history: h });
    expect(Object.keys(churn)).toEqual(['src/a.ts']);
  });
});
