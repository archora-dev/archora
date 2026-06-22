import { describe, expect, it } from 'vitest';
import { computeTemporalCoupling } from '../computeTemporalCoupling';
import type { GitCommit, GitHistory } from '../types';
import type { DependencyEdge, ModuleNode } from '../../analyzer/types';

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

function commit(sha: string, paths: string[]): GitCommit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    author: 'a@x.com',
    authorName: 'a',
    authoredAt: '2026-05-01T10:00:00Z',
    subject: sha,
    changes: paths.map((p) => ({ path: p, added: 1, removed: 0 })),
  };
}

function history(commits: GitCommit[]): GitHistory {
  return { since: '90d', until: 'now', commits, includesMerges: false };
}

const NO_EDGES: DependencyEdge[] = [];

describe('computeTemporalCoupling', () => {
  it('finds tight pairs above thresholds', () => {
    const modules = [mod('src/a.ts'), mod('src/b.ts'), mod('src/c.ts')];
    const h = history([
      commit('1', ['src/a.ts', 'src/b.ts']),
      commit('2', ['src/a.ts', 'src/b.ts']),
      commit('3', ['src/a.ts', 'src/b.ts']),
      commit('4', ['src/a.ts']),
      commit('5', ['src/c.ts']),
    ]);
    const out = computeTemporalCoupling({ modules, edges: NO_EDGES, history: h });
    expect(out).toHaveLength(1);
    expect(out[0]?.a).toBe('src/a.ts');
    expect(out[0]?.b).toBe('src/b.ts');
    expect(out[0]?.coOccurrences).toBe(3);
    // a touched 4 times, b touched 3 times -> min(3/4, 3/3) = 0.75
    expect(out[0]?.score).toBeCloseTo(0.75);
    expect(out[0]?.hidden).toBe(true);
  });

  it('marks pairs with a static edge as not hidden', () => {
    const modules = [mod('src/a.ts'), mod('src/b.ts')];
    const edges: DependencyEdge[] = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'static', specifier: './b', resolved: true },
    ];
    const h = history([
      commit('1', ['src/a.ts', 'src/b.ts']),
      commit('2', ['src/a.ts', 'src/b.ts']),
      commit('3', ['src/a.ts', 'src/b.ts']),
    ]);
    const out = computeTemporalCoupling({ modules, edges, history: h });
    expect(out[0]?.hidden).toBe(false);
  });

  it('skips fan-out commits past the cap', () => {
    const modules = Array.from({ length: 100 }, (_, i) => mod(`src/m${i}.ts`));
    // One mass-edit commit touching all 100 modules. Without the cap, every
    // pair would receive a co-occurrence — 4950 false positives.
    const c = commit(
      'mass',
      modules.map((m) => m.id),
    );
    const h = history([c, c, c]);
    const out = computeTemporalCoupling({
      modules,
      edges: NO_EDGES,
      history: h,
      thresholds: { commitFanOutCap: 50 },
    });
    expect(out).toHaveLength(0);
  });

  it('honours minCoOccurrences', () => {
    const modules = [mod('src/a.ts'), mod('src/b.ts')];
    const h = history([
      commit('1', ['src/a.ts', 'src/b.ts']),
      commit('2', ['src/a.ts', 'src/b.ts']),
    ]);
    const out = computeTemporalCoupling({
      modules,
      edges: NO_EDGES,
      history: h,
      thresholds: { minCoOccurrences: 3 },
    });
    expect(out).toHaveLength(0);
  });

  it('sorts hidden pairs first then by score desc', () => {
    const modules = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'].map(mod);
    // Pair (a,b): static edge, perfect score. Pair (c,d): no edge, score 0.6.
    const edges: DependencyEdge[] = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'static', specifier: './b', resolved: true },
    ];
    const h = history([
      commit('1', ['src/a.ts', 'src/b.ts']),
      commit('2', ['src/a.ts', 'src/b.ts']),
      commit('3', ['src/a.ts', 'src/b.ts']),
      commit('4', ['src/c.ts', 'src/d.ts']),
      commit('5', ['src/c.ts', 'src/d.ts']),
      commit('6', ['src/c.ts', 'src/d.ts']),
      commit('7', ['src/c.ts']),
      commit('8', ['src/d.ts']),
    ]);
    const out = computeTemporalCoupling({ modules, edges, history: h });
    expect(out).toHaveLength(2);
    expect(out[0]?.hidden).toBe(true); // c,d shown first despite lower score
    expect(out[0]?.a).toBe('src/c.ts');
    expect(out[1]?.hidden).toBe(false);
  });

  it('ranks a cross-boundary hidden coupling above an equally-strong same-folder one', () => {
    const modules = ['features/auth/a.ts', 'entities/user/b.ts', 'shared/x.ts', 'shared/y.ts'].map(
      mod,
    );
    const h = history([
      commit('1', ['features/auth/a.ts', 'entities/user/b.ts']),
      commit('2', ['features/auth/a.ts', 'entities/user/b.ts']),
      commit('3', ['features/auth/a.ts', 'entities/user/b.ts']),
      commit('4', ['shared/x.ts', 'shared/y.ts']),
      commit('5', ['shared/x.ts', 'shared/y.ts']),
      commit('6', ['shared/x.ts', 'shared/y.ts']),
    ]);
    const out = computeTemporalCoupling({ modules, edges: NO_EDGES, history: h });
    expect(out).toHaveLength(2);
    // Both are hidden, score 1.0, 3 co-occurrences — only the boundary differs.
    const cross = out.find((c) => c.a === 'entities/user/b.ts' || c.b === 'entities/user/b.ts');
    const same = out.find((c) => c.a === 'shared/x.ts' && c.b === 'shared/y.ts');
    expect(cross?.crossBoundary).toBe(true);
    expect(same?.crossBoundary).toBe(false);
    expect(cross!.risk).toBeGreaterThan(same!.risk);
    expect(out[0]).toBe(cross); // cross-boundary ranks first
    expect(cross!.risk).toBeLessThanOrEqual(1);
  });
});
