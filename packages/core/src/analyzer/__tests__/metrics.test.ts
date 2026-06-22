import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../metrics';
import { detectCycles } from '../cycles';
import type { DependencyEdge, ModuleNode } from '../types';

const mod = (id: string, loc = 10): ModuleNode => ({
  id,
  absPath: id,
  kind: 'unknown',
  language: 'ts',
  loc,
  exports: [],
  isInfra: false,
});
const edge = (from: string, to: string): DependencyEdge => ({
  from,
  to,
  kind: 'static',
  specifier: to,
  resolved: true,
});

describe('computeMetrics', () => {
  it('counts fan-in/out and instability', () => {
    const modules = [mod('a'), mod('b'), mod('c')];
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'c')];
    const m = computeMetrics({ modules, edges, cycles: [], entries: ['a'] });
    expect(m['a']!.fanIn).toBe(0);
    expect(m['a']!.fanOut).toBe(2);
    expect(m['a']!.instability).toBe(1);
    expect(m['b']!.fanIn).toBe(1);
    expect(m['b']!.fanOut).toBe(1);
    expect(m['b']!.instability).toBe(0.5);
    expect(m['c']!.fanIn).toBe(2);
    expect(m['c']!.fanOut).toBe(0);
    expect(m['c']!.instability).toBe(0);
  });

  it('marks inCycle and ranks coupling', () => {
    const modules = [mod('a'), mod('b'), mod('c')];
    const edges = [edge('a', 'b'), edge('b', 'a'), edge('a', 'c')];
    const cycles = detectCycles(modules, edges);
    const m = computeMetrics({ modules, edges, cycles, entries: [] });
    expect(m['a']!.inCycle).toBe(true);
    expect(m['b']!.inCycle).toBe(true);
    expect(m['c']!.inCycle).toBe(false);
    expect(m['a']!.couplingScore).toBeGreaterThan(0);
  });

  it('computes depth from entry through DAG (after SCC condensation)', () => {
    const modules = [mod('a'), mod('b'), mod('c'), mod('d')];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')];
    const m = computeMetrics({ modules, edges, cycles: [], entries: ['a'] });
    expect(m['a']!.depth).toBe(0);
    expect(m['b']!.depth).toBe(1);
    expect(m['c']!.depth).toBe(2);
    expect(m['d']!.depth).toBe(3);
  });

  it('collapses an SCC so cycle members share one condensation depth', () => {
    // a -> b -> c -> b  (b,c form a cycle), then c -> d.
    const modules = [mod('a'), mod('b'), mod('c'), mod('d')];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'b'), edge('c', 'd')];
    const cycles = detectCycles(modules, edges);
    const m = computeMetrics({ modules, edges, cycles, entries: ['a'] });
    expect(m['a']!.depth).toBe(0);
    // b and c are one condensed node -> equal depth, exactly one hop past `a`.
    expect(m['b']!.depth).toBe(1);
    expect(m['c']!.depth).toBe(1);
    // d sits one hop past the condensed {b,c}.
    expect(m['d']!.depth).toBe(2);
  });

  it('takes the longest path to a node reachable by two routes (diamond)', () => {
    // a -> b -> d and a -> c -> d, plus a long leg a -> b -> e -> d.
    const modules = [mod('a'), mod('b'), mod('c'), mod('d'), mod('e')];
    const edges = [
      edge('a', 'b'),
      edge('a', 'c'),
      edge('b', 'd'),
      edge('c', 'd'),
      edge('b', 'e'),
      edge('e', 'd'),
    ];
    const m = computeMetrics({ modules, edges, cycles: [], entries: ['a'] });
    expect(m['d']!.depth).toBe(3); // a -> b -> e -> d is the longest route
  });

  it('weights hotness by file size at equal coupling (sizeFactor)', () => {
    // c1 and c2 are symmetric (both imported by `a`, both import `z`) so their
    // coupling is identical; only the file size differs.
    const modules = [mod('a'), mod('c1', 10), mod('c2', 5000), mod('z')];
    const edges = [edge('a', 'c1'), edge('a', 'c2'), edge('c1', 'z'), edge('c2', 'z')];
    const m = computeMetrics({ modules, edges, cycles: [], entries: ['a'] });
    expect(m['c1']!.couplingScore).toBe(m['c2']!.couplingScore);
    expect(m['c2']!.hotnessScore).toBeGreaterThan(m['c1']!.hotnessScore);
  });
});
