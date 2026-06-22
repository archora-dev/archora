import { describe, it, expect } from 'vitest';
import { detectCycles } from '../cycles';
import type { DependencyEdge, ModuleNode } from '../types';

const mod = (id: string): ModuleNode => ({
  id,
  absPath: id,
  kind: 'unknown',
  language: 'ts',
  loc: 1,
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

describe('detectCycles', () => {
  it('finds 2-cycle and marks it direct', () => {
    const cycles = detectCycles([mod('a'), mod('b'), mod('c')], [edge('a', 'b'), edge('b', 'a')]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.severity).toBe('direct');
    expect(cycles[0]?.modules.sort()).toEqual(['a', 'b']);
  });

  it('finds 3-cycle and marks it indirect', () => {
    const cycles = detectCycles(
      [mod('a'), mod('b'), mod('c')],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
    );
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.severity).toBe('indirect');
    expect(cycles[0]?.length).toBe(3);
  });

  it('ignores type-only edges', () => {
    const cycles = detectCycles(
      [mod('a'), mod('b')],
      [{ from: 'a', to: 'b', kind: 'type-only', specifier: 'b', resolved: true }, edge('b', 'a')],
    );
    expect(cycles).toHaveLength(0);
  });

  it('detects self-import as length-1 direct cycle', () => {
    const cycles = detectCycles([mod('a')], [edge('a', 'a')]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.length).toBe(1);
    expect(cycles[0]?.severity).toBe('direct');
  });

  it('produces a short stable content-addressed cycle id', () => {
    // Regression: the old join('|') form produced 2kB+ ids on a real
    // 53-module SCC, breaking UI keys, fix-plan ids and baselines.
    const many = Array.from({ length: 40 }, (_, i) => `src/m${i}.ts`);
    const mods = many.map(mod);
    const edges = many.map((id, i) => edge(id, many[(i + 1) % many.length]!));
    const cycles = detectCycles(mods, edges);
    expect(cycles).toHaveLength(1);
    const id = cycles[0]?.id ?? '';
    expect(id).toMatch(/^cycle:[0-9a-f]{8}$/u);
    expect(id.length).toBeLessThan(32);
  });

  it('cycle id is stable across module insertion order', () => {
    const a = detectCycles([mod('a'), mod('b'), mod('c')], [edge('a', 'b'), edge('b', 'a')]);
    const b = detectCycles([mod('b'), mod('a'), mod('c')], [edge('b', 'a'), edge('a', 'b')]);
    expect(a[0]?.id).toBe(b[0]?.id);
  });
});
