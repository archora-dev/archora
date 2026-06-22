import { describe, it, expect } from 'vitest';
import { classifyCyclePattern } from '../cyclePatterns';
import { feedbackArcSet, edgeKey } from '../feedbackArcSet';
import type { DependencyEdge } from '../types';

const e = (from: string, to: string, kind: DependencyEdge['kind'] = 'static'): DependencyEdge => ({
  from,
  to,
  kind,
  specifier: to,
  resolved: true,
});

describe('classifyCyclePattern', () => {
  it('detects mutual-pair', () => {
    const internal = [e('a.ts', 'b.ts'), e('b.ts', 'a.ts')];
    const fas = feedbackArcSet(['a.ts', 'b.ts'], internal);
    const p = classifyCyclePattern({
      scc: ['a.ts', 'b.ts'],
      internalEdges: internal,
      feedback: fas.feedback,
    });
    expect(p.kind).toBe('mutual-pair');
    if (p.kind === 'mutual-pair') {
      expect(p.a).toBe('a.ts');
      expect(p.b).toBe('b.ts');
    }
  });

  it('detects barrel-cycle (sibling imports through same-folder index)', () => {
    // src/foo/index.ts imports src/foo/bar.ts; src/foo/bar.ts imports
    // back through '.' (i.e. resolves to src/foo/index.ts)
    const internal = [
      e('src/foo/index.ts', 'src/foo/bar.ts'),
      e('src/foo/bar.ts', 'src/foo/index.ts'),
    ];
    const fas = feedbackArcSet(['src/foo/index.ts', 'src/foo/bar.ts'], internal);
    const p = classifyCyclePattern({
      scc: ['src/foo/index.ts', 'src/foo/bar.ts'],
      internalEdges: internal,
      feedback: fas.feedback,
    });
    // mutual-pair takes precedence for SCC of 2; verify the more interesting
    // case below where SCC > 2 still routes to barrel
    expect(['mutual-pair', 'barrel-cycle']).toContain(p.kind);
  });

  it('detects barrel-cycle in 3-SCC with single feedback edge into sibling index', () => {
    // a→b→c→index→a, where a is sibling of index in src/foo
    const nodes = ['src/foo/index.ts', 'src/foo/a.ts', 'src/foo/b.ts'];
    const internal = [
      e('src/foo/index.ts', 'src/foo/a.ts'),
      e('src/foo/a.ts', 'src/foo/b.ts'),
      e('src/foo/b.ts', 'src/foo/index.ts'),
    ];
    const fas = feedbackArcSet(nodes, internal);
    expect(fas.feedback.size).toBe(1);
    const p = classifyCyclePattern({ scc: nodes, internalEdges: internal, feedback: fas.feedback });
    expect(p.kind).toBe('barrel-cycle');
    if (p.kind === 'barrel-cycle') {
      expect(p.barrel).toBe('src/foo/index.ts');
    }
  });

  it('detects hub-feedback: ≥70% of feedback edges point into same hub', () => {
    // 5 producers all back-edge into hub
    const nodes = ['hub.ts', 'p1.ts', 'p2.ts', 'p3.ts', 'p4.ts', 'p5.ts'];
    const internal: DependencyEdge[] = [];
    for (const p of nodes.slice(1)) {
      internal.push(e('hub.ts', p));
      internal.push(e(p, 'hub.ts'));
    }
    const fas = feedbackArcSet(nodes, internal);
    const p = classifyCyclePattern({
      scc: nodes,
      internalEdges: internal,
      feedback: fas.feedback,
    });
    // FAS will pick one orientation; the hub is whichever side becomes target
    expect(p.kind).toBe('hub-feedback');
    if (p.kind === 'hub-feedback') {
      expect(p.incomingCount).toBeGreaterThanOrEqual(4);
      expect(p.valueImports).toBe(p.incomingCount); // all static
    }
  });

  it('hub-feedback excludes type-only edges from valueImports count', () => {
    const nodes = ['hub.ts', 'p1.ts', 'p2.ts', 'p3.ts', 'p4.ts'];
    const internal: DependencyEdge[] = [];
    for (const p of nodes.slice(1)) internal.push(e('hub.ts', p));
    // back-edges: 3 static, 1 type-only
    internal.push(e('p1.ts', 'hub.ts'));
    internal.push(e('p2.ts', 'hub.ts'));
    internal.push(e('p3.ts', 'hub.ts'));
    internal.push(e('p4.ts', 'hub.ts', 'type-only'));
    const fas = feedbackArcSet(nodes, internal);
    const p = classifyCyclePattern({ scc: nodes, internalEdges: internal, feedback: fas.feedback });
    expect(p.kind).toBe('hub-feedback');
    if (p.kind === 'hub-feedback') {
      // type-only edge isn't even in FAS - all 3 feedback edges are value
      expect(p.valueImports).toBe(3);
    }
  });

  it('detects long-chain: large SCC with single feedback edge', () => {
    // 10-node ring: chain of 10 + one back-edge from last to first
    const nodes = Array.from({ length: 10 }, (_, i) => `n${i}.ts`);
    const internal: DependencyEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) internal.push(e(nodes[i]!, nodes[i + 1]!));
    internal.push(e(nodes[nodes.length - 1]!, nodes[0]!));
    const fas = feedbackArcSet(nodes, internal);
    expect(fas.feedback.size).toBe(1);
    const p = classifyCyclePattern({ scc: nodes, internalEdges: internal, feedback: fas.feedback });
    expect(p.kind).toBe('long-chain');
    if (p.kind === 'long-chain') {
      expect(p.length).toBe(10);
      expect(p.bridge).toBe(edgeKey('n9.ts', 'n0.ts'));
    }
  });

  it('falls back to mixed when no pattern fits', () => {
    // 3-cycle a→b→c→a, no special structure (not mutual, not barrel, no hub)
    const internal = [e('a.ts', 'b.ts'), e('b.ts', 'c.ts'), e('c.ts', 'a.ts')];
    const fas = feedbackArcSet(['a.ts', 'b.ts', 'c.ts'], internal);
    const p = classifyCyclePattern({
      scc: ['a.ts', 'b.ts', 'c.ts'],
      internalEdges: internal,
      feedback: fas.feedback,
    });
    expect(p.kind).toBe('mixed');
  });
});
