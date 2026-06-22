import { describe, it, expect } from 'vitest';
import { feedbackArcSet, countBrokenCycles, edgeKey, parseEdgeKey } from '../feedbackArcSet';
import type { DependencyEdge } from '../types';

const e = (from: string, to: string, kind: DependencyEdge['kind'] = 'static'): DependencyEdge => ({
  from,
  to,
  kind,
  specifier: to,
  resolved: true,
});

describe('feedbackArcSet', () => {
  it('breaks a 2-cycle with one edge', () => {
    const r = feedbackArcSet(['a', 'b'], [e('a', 'b'), e('b', 'a')]);
    expect(r.feedback.size).toBe(1);
  });

  it('breaks a 3-cycle with one edge', () => {
    const r = feedbackArcSet(['a', 'b', 'c'], [e('a', 'b'), e('b', 'c'), e('c', 'a')]);
    expect(r.feedback.size).toBe(1);
  });

  it('breaks two independent loops sharing a hub', () => {
    // x→hub, hub→a→x, hub→b→x : two cycles (hub-a-x-hub) and (hub-b-x-hub)
    // but x and hub form an SCC of {x, hub, a, b}; both loops close via x→hub.
    // Greedy FAS should pick a single feedback edge (most likely x→hub) that
    // breaks both loops.
    const edges = [e('x', 'hub'), e('hub', 'a'), e('a', 'x'), e('hub', 'b'), e('b', 'x')];
    const r = feedbackArcSet(['x', 'hub', 'a', 'b'], edges);
    expect(r.feedback.size).toBeGreaterThanOrEqual(1);
    expect(r.feedback.size).toBeLessThanOrEqual(2);
  });

  it('hub-pointing pattern: many feedback edges target the same hub', () => {
    // 4 producers all feed back into a single hub h that they were reached from
    // h → p1, p2, p3, p4 (producers); each producer → h (back edge)
    const edges = [
      e('h', 'p1'),
      e('h', 'p2'),
      e('h', 'p3'),
      e('h', 'p4'),
      e('p1', 'h'),
      e('p2', 'h'),
      e('p3', 'h'),
      e('p4', 'h'),
    ];
    const r = feedbackArcSet(['h', 'p1', 'p2', 'p3', 'p4'], edges);
    // either direction (forward or backward) makes all edges feedback - we
    // accept whichever orientation FAS picks as long as it's consistent
    const targets = [...r.feedback].map((k) => parseEdgeKey(k).to);
    const uniqueTargets = new Set(targets);
    expect(uniqueTargets.size).toBe(1);
    expect(r.feedback.size).toBe(4);
  });

  it('handles self-loop on singleton SCC', () => {
    const r = feedbackArcSet(['a'], [e('a', 'a')]);
    expect([...r.feedback]).toEqual([edgeKey('a', 'a')]);
  });

  it('ignores type-only edges', () => {
    const r = feedbackArcSet(['a', 'b'], [e('a', 'b'), e('b', 'a', 'type-only')]);
    // SCC isn't actually strongly connected without the type-only edge, but
    // FAS doesn't re-validate - with only a→b internal there are no feedback
    // edges (it's a DAG).
    expect(r.feedback.size).toBe(0);
  });

  it('dedupes parallel edges with the same direction', () => {
    const edges = [e('a', 'b'), e('a', 'b', 'dynamic'), e('b', 'a')];
    const r = feedbackArcSet(['a', 'b'], edges);
    expect(r.internal.length).toBe(2); // one a→b, one b→a
  });

  it('produces feedback set whose removal makes the SCC acyclic', () => {
    // dense SCC: complete digraph K4 (all 12 directed edges)
    const nodes = ['a', 'b', 'c', 'd'];
    const edges: DependencyEdge[] = [];
    for (const a of nodes) for (const b of nodes) if (a !== b) edges.push(e(a, b));
    const r = feedbackArcSet(nodes, edges);

    // verify: in r.order, no edge points backwards (other than feedback)
    const pos = new Map(r.order.map((id, i) => [id, i]));
    const backward = r.internal.filter(
      (ed) => ed.from !== ed.to && (pos.get(ed.from) ?? 0) > (pos.get(ed.to) ?? 0),
    );
    const backwardKeys = new Set(backward.map((ed) => edgeKey(ed.from, ed.to)));
    expect(backwardKeys).toEqual(r.feedback);
  });
});

describe('countBrokenCycles', () => {
  it('exact count for small SCC: 2-cycle = 1 cycle broken', () => {
    const internal = [e('a', 'b'), e('b', 'a')];
    const fas = feedbackArcSet(['a', 'b'], internal);
    const r = countBrokenCycles(['a', 'b'], internal, fas.feedback);
    expect(r.totalCycles).toBe(1);
    expect(r.totalPartial).toBe(false);
    const only = [...fas.feedback][0]!;
    expect(r.byEdge.get(only)?.broken).toBe(1);
  });

  it('exact count for two independent 3-cycles sharing one node', () => {
    // a→b→c→a and a→d→e→a : two 3-cycles, removing edge into a (the shared
    // node) breaks both
    const internal = [e('a', 'b'), e('b', 'c'), e('c', 'a'), e('a', 'd'), e('d', 'e'), e('e', 'a')];
    const fas = feedbackArcSet(['a', 'b', 'c', 'd', 'e'], internal);
    const r = countBrokenCycles(['a', 'b', 'c', 'd', 'e'], internal, fas.feedback);
    expect(r.totalCycles).toBe(2);
    expect(r.totalPartial).toBe(false);
    // sum over feedback edges should equal at least the number of cycles
    // (each cycle has at least one feedback edge along it)
    const totalBroken = [...r.byEdge.values()].reduce((s, v) => s + v.broken, 0);
    expect(totalBroken).toBeGreaterThanOrEqual(2);
  });

  it('terminates on a dense large SCC instead of enumerating exponentially', () => {
    // Near-complete digraph on 30 nodes: ~870 edges, and the number of simple
    // paths between any two nodes is ~e·28! (≈1e29). Without a DFS step budget,
    // countSimplePaths explores that space and never returns. The budget must
    // bound the work so a real-world dense cyclic cluster can't hang the scan.
    const N = 30;
    const nodes = Array.from({ length: N }, (_, i) => `n${i}`);
    const internal: DependencyEdge[] = [];
    for (const a of nodes) for (const b of nodes) if (a !== b) internal.push(e(a, b));
    const fas = feedbackArcSet(nodes, internal);
    const started = Date.now();
    const r = countBrokenCycles(nodes, internal, fas.feedback, { stepCap: 5000 });
    // The assertion that matters is that we got here at all (no hang). Keep a
    // generous wall-clock guard so a regression that reintroduces the blowup
    // fails loudly rather than wedging the suite.
    expect(Date.now() - started).toBeLessThan(3000);
    expect(r.totalPartial).toBe(true);
    expect(r.byEdge.size).toBe(fas.feedback.size);
  }, 8000);

  it('caps elementary-cycle enumeration on a dense sub-limit SCC', () => {
    // Complete digraph on 12 nodes (≤ exactLimit) has ~e·11! (≈1e8) elementary
    // cycles. Johnson enumeration must stop at the cycle cap and report partial
    // rather than enumerating all of them.
    const N = 12;
    const nodes = Array.from({ length: N }, (_, i) => `n${i}`);
    const internal: DependencyEdge[] = [];
    for (const a of nodes) for (const b of nodes) if (a !== b) internal.push(e(a, b));
    const fas = feedbackArcSet(nodes, internal);
    const started = Date.now();
    const r = countBrokenCycles(nodes, internal, fas.feedback, { exactLimit: 20, cycleCap: 5000 });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(r.totalPartial).toBe(true);
    expect(r.totalCycles).toBe(-1);
  }, 8000);

  it('partial count for large SCC', () => {
    // construct a 25-node SCC: linear chain plus back-edge from last to first
    const nodes = Array.from({ length: 25 }, (_, i) => `n${i}`);
    const internal: DependencyEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) internal.push(e(nodes[i]!, nodes[i + 1]!));
    internal.push(e(nodes[nodes.length - 1]!, nodes[0]!));
    const fas = feedbackArcSet(nodes, internal);
    const r = countBrokenCycles(nodes, internal, fas.feedback);
    expect(r.totalCycles).toBe(-1);
    expect(r.totalPartial).toBe(true);
    // the single back-edge breaks exactly one elementary cycle
    const only = [...fas.feedback][0]!;
    expect(r.byEdge.get(only)?.broken).toBe(1);
  });
});
