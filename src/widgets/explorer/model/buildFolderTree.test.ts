import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import type { FolderExplorerItem } from '@/entities/architecture/model/types';
import { buildFileLeaves, buildFolderTree, type FileLeaf } from './buildFolderTree';

function makeItem(id: string, overrides: Partial<FolderExplorerItem> = {}): FolderExplorerItem {
  return {
    id,
    label: id.split('/').at(-1) ?? id,
    type: 'folder',
    layer: 'unknown',
    depth: id.split('/').length - 1,
    fileCount: 1,
    outgoingDeps: 0,
    incomingDeps: 0,
    cycleCount: 0,
    violationCount: 0,
    memoryRiskCount: 0,
    asyncLifecycleRiskCount: 0,
    fanIn: 0,
    fanOut: 0,
    riskScore: 0,
    isOrphaned: false,
    hasHotModule: false,
    isGenerated: false,
    badges: [],
    topFiles: [],
    ...overrides,
  };
}

describe('buildFolderTree', () => {
  it('synthesizes missing intermediate ancestors', () => {
    const items = [makeItem('a/b/c'), makeItem('a/b/d')];
    const result = buildFolderTree(items);

    // Only one root 'a'
    expect(result).toHaveLength(1);

    const a = result[0]!;
    expect(a.id).toBe('a');
    expect(a.label).toBe('a');

    // 'a' has one child 'a/b'
    expect(a.children).toHaveLength(1);

    const ab = a.children![0]!;
    expect(ab.id).toBe('a/b');
    expect(ab.label).toBe('b');

    // 'a/b' has two children 'a/b/c' and 'a/b/d'
    const abChildren = ab.children!;
    expect(abChildren).toHaveLength(2);
    expect(abChildren.map((n) => n.id)).toEqual(['a/b/c', 'a/b/d']);
    expect(abChildren.map((n) => n.label)).toEqual(['c', 'd']);
  });

  it('keeps duplicate leaf labels under distinct parents', () => {
    const items = [makeItem('proj1/src'), makeItem('proj2/src')];
    const result = buildFolderTree(items);

    // Two roots, not four nodes at root
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toEqual(['proj1', 'proj2']);

    // Each root has exactly one child labeled 'src'
    const proj1Children = result[0]!.children!;
    const proj2Children = result[1]!.children!;
    expect(proj1Children).toHaveLength(1);
    expect(proj2Children).toHaveLength(1);
    expect(proj1Children[0]!.label).toBe('src');
    expect(proj2Children[0]!.label).toBe('src');
    expect(proj1Children[0]!.id).toBe('proj1/src');
    expect(proj2Children[0]!.id).toBe('proj2/src');
  });

  it('nests a deep path into a single chain', () => {
    const items = [makeItem('x/y/z/w')];
    const result = buildFolderTree(items);

    expect(result).toHaveLength(1);
    const x = result[0]!;
    expect(x.id).toBe('x');

    const y = x.children![0]!;
    expect(y.id).toBe('x/y');

    const z = y.children![0]!;
    expect(z.id).toBe('x/y/z');

    const w = z.children![0]!;
    expect(w.id).toBe('x/y/z/w');
    expect(w.label).toBe('w');
  });

  it('uses item id as node id and last path segment as label for real items', () => {
    const items = [makeItem('real/path', { violationCount: 3, cycleCount: 1 })];
    const result = buildFolderTree(items);

    // 'real' is a synthetic ancestor
    expect(result[0]!.id).toBe('real');

    // 'real/path' is the actual item — its label is just the last segment
    const realNode = result[0]!.children![0]!;
    expect(realNode.id).toBe('real/path');
    expect(realNode.label).toBe('path');
  });

  it('expands nodes at depth < 2 and collapses deeper ones', () => {
    const items = [makeItem('a/b/c/d')];
    const result = buildFolderTree(items);

    const a = result[0]!; // depth 0 (single segment)
    expect(a.expanded).toBe(true);

    const b = a.children![0]!; // depth 1
    expect(b.expanded).toBe(true);

    const c = b.children![0]!; // depth 2
    expect(c.expanded).toBe(false);

    const d = c.children![0]!; // depth 3
    expect(d.expanded).toBe(false);
  });

  it('rolls descendant risk counts up to ancestor folders', () => {
    const items = [
      makeItem('a/b/c', { cycleCount: 1, violationCount: 2 }),
      makeItem('a/b/d', { cycleCount: 0, violationCount: 3 }),
    ];
    const result = buildFolderTree(items);

    const a = result[0]!;
    expect(a.cycleCount).toBe(1);
    expect(a.violationCount).toBe(5);

    const ab = a.children![0]!;
    expect(ab.cycleCount).toBe(1);
    expect(ab.violationCount).toBe(5);

    const c = ab.children!.find((n) => n.id === 'a/b/c')!;
    expect(c.cycleCount).toBe(1);
    expect(c.violationCount).toBe(2);
  });

  it('sorts children alphabetically by id at each level', () => {
    const items = [makeItem('root/z'), makeItem('root/a'), makeItem('root/m')];
    const result = buildFolderTree(items);

    expect(result).toHaveLength(1);
    const children = result[0]!.children!;
    expect(children.map((n) => n.id)).toEqual(['root/a', 'root/m', 'root/z']);
  });

  it('handles single-segment ids as roots with no parent', () => {
    const items = [makeItem('src'), makeItem('lib')];
    const result = buildFolderTree(items);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id).sort()).toEqual(['lib', 'src']);
    for (const node of result) {
      expect(node.children).toBeUndefined();
    }
  });
});

function makeLeaf(id: string, overrides: Partial<FileLeaf> = {}): FileLeaf {
  return { id, inCycle: false, isHot: false, hasViolation: false, ...overrides };
}

describe('buildFolderTree with file leaves', () => {
  it('places a cyclic module as a flagged leaf under its folder', () => {
    const items = [makeItem('src/a', { cycleCount: 1 })];
    const files = [makeLeaf('src/a/loop.ts', { inCycle: true }), makeLeaf('src/a/plain.ts')];
    const result = buildFolderTree(items, files);

    const src = result.find((n) => n.id === 'src')!;
    const a = src.children!.find((n) => n.id === 'src/a')!;
    const leaves = a.children!.filter((n) => n.kind === 'file');
    expect(leaves.map((n) => n.id)).toEqual(['src/a/loop.ts', 'src/a/plain.ts']);

    const loop = leaves.find((n) => n.id === 'src/a/loop.ts')!;
    expect(loop.kind).toBe('file');
    expect(loop.inCycle).toBe(true);
    expect(loop.children).toBeUndefined();
    expect(loop.expanded).toBeUndefined();
  });

  it('sorts subfolders before files at each level', () => {
    const items = [makeItem('src/a')];
    const files = [makeLeaf('src/a/z.ts')];
    const result = buildFolderTree(items, files);

    const a = result[0]!.children!.find((n) => n.id === 'src/a')!;
    // 'src/a/sub' is synthesized from the deeper file below; it must sort first.
    const deep = buildFolderTree(items, [makeLeaf('src/a/sub/deep.ts'), makeLeaf('src/a/z.ts')]);
    const a2 = deep[0]!.children!.find((n) => n.id === 'src/a')!;
    expect(a2.children!.map((n) => `${n.kind}:${n.id}`)).toEqual([
      'folder:src/a/sub',
      'file:src/a/z.ts',
    ]);
    expect(a.children![0]!.id).toBe('src/a/z.ts');
  });

  it('does not let file leaves inflate folder risk counts', () => {
    const items = [makeItem('src/a', { cycleCount: 2, violationCount: 1 })];
    const files = [makeLeaf('src/a/loop.ts', { inCycle: true })];
    const result = buildFolderTree(items, files);

    const a = result[0]!.children!.find((n) => n.id === 'src/a')!;
    expect(a.cycleCount).toBe(2);
    expect(a.violationCount).toBe(1);
  });
});

function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: 't',
    durationMs: 1,
    warnings: [],
    ...overrides,
  } as ScanResult;
}

describe('buildFileLeaves', () => {
  it('flags modules in cycles, hot zones and layer violations', () => {
    const module = (id: string) => ({
      id,
      absPath: `/${id}`,
      kind: 'module' as const,
      language: 'ts' as const,
      loc: 1,
      exports: [],
      isInfra: false,
    });
    const scan = makeScan({
      modules: [module('src/a.ts'), module('src/b.ts'), module('src/c.ts'), module('src/d.ts')],
      metrics: {
        'src/a.ts': {
          fanIn: 0,
          fanOut: 0,
          instability: 0,
          depth: 0,
          inCycle: true,
          couplingScore: 0,
          hotnessScore: 0,
        },
      },
      cycles: [{ id: 'cycle:1', modules: ['src/b.ts', 'src/x.ts'], length: 2, severity: 'direct' }],
      hotZones: ['src/c.ts'],
      layerViolations: [
        {
          edgeId: 'e',
          from: 'src/d.ts',
          to: 'src/a.ts',
          fromLayer: 'shared',
          toLayer: 'app',
          severity: 'error',
        },
      ],
    });

    const leaves = buildFileLeaves(scan);
    const byId = new Map(leaves.map((l) => [l.id, l]));

    expect(byId.get('src/a.ts')!.inCycle).toBe(true); // from metrics
    expect(byId.get('src/b.ts')!.inCycle).toBe(true); // from cycle membership
    expect(byId.get('src/c.ts')!.isHot).toBe(true);
    expect(byId.get('src/d.ts')!.hasViolation).toBe(true);
    expect(byId.get('src/a.ts')!.hasViolation).toBe(true); // violation target side
  });
});
