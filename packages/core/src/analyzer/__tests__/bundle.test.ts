// Bundle-aware analysis.
// Covers stats parsing for both supported formats, mapping onto the module
// graph, and bloat detection thresholds.

import { describe, expect, it } from 'vitest';

import { analyzeBundle, parseBundleStats } from '../bundle';
import type { ModuleNode } from '../types';

function mod(id: string, overrides: Partial<ModuleNode> = {}): ModuleNode {
  return {
    id,
    absPath: id,
    kind: 'unknown',
    language: 'ts',
    loc: 50,
    exports: [],
    isInfra: false,
    ...overrides,
  };
}

describe('parseBundleStats', () => {
  it('parses webpack stats and normalizes module paths', () => {
    const stats = parseBundleStats(
      {
        chunks: [
          {
            id: 0,
            names: ['main'],
            files: ['main.js'],
            size: 12000,
            modules: [
              { name: './src/app/index.ts', size: 4000 },
              { name: 'src/shared/lib/utils.ts?vue&type=script', size: 800 },
            ],
          },
        ],
      },
      { rootPath: '/repo' },
    );

    expect(stats.format).toBe('webpack');
    expect(stats.chunks).toHaveLength(1);
    expect(stats.chunks[0]?.modules.map((m) => m.normalizedPath)).toEqual([
      'src/app/index.ts',
      'src/shared/lib/utils.ts',
    ]);
  });

  it('parses rollup-plugin-visualizer trees', () => {
    const stats = parseBundleStats(
      {
        tree: {
          name: 'root',
          children: [
            {
              name: 'main.js',
              children: [
                {
                  name: 'src',
                  children: [
                    { name: 'app/index.ts', size: 2000 },
                    { name: 'shared/lib/utils.ts', size: 600 },
                  ],
                },
              ],
            },
          ],
        },
      },
      { rootPath: '/repo' },
    );

    expect(stats.format).toBe('rollup-visualizer');
    expect(stats.chunks).toHaveLength(1);
    expect(stats.chunks[0]?.size).toBe(2600);
    const paths = stats.chunks[0]?.modules.map((m) => m.normalizedPath);
    expect(paths).toContain('main.js/src/app/index.ts');
  });

  it('returns empty unknown report on garbage input', () => {
    expect(parseBundleStats(null, { rootPath: '/x' })).toEqual({ format: 'unknown', chunks: [] });
    expect(parseBundleStats({ random: 1 }, { rootPath: '/x' })).toEqual({
      format: 'unknown',
      chunks: [],
    });
  });
});

describe('analyzeBundle', () => {
  it('flags duplicates, heavy chunks and solo-hot modules', () => {
    const modules = [
      mod('src/app/index.ts'),
      mod('src/shared/big.ts', { loc: 4000 }),
      mod('src/shared/lib/utils.ts'),
    ];

    const stats = parseBundleStats(
      {
        chunks: [
          {
            id: 'main',
            files: ['main.js'],
            size: 600_000,
            modules: [
              { name: 'src/app/index.ts', size: 100_000 },
              { name: 'src/shared/big.ts', size: 480_000 },
              { name: 'src/shared/lib/utils.ts', size: 5_000 },
            ],
          },
          {
            id: 'admin',
            files: ['admin.js'],
            size: 220_000,
            modules: [{ name: 'src/shared/lib/utils.ts', size: 5_000 }],
          },
        ],
      },
      { rootPath: '/repo' },
    );

    const report = analyzeBundle({ modules, stats });

    expect(report.format).toBe('webpack');
    expect(report.totalSize).toBe(820_000);

    const kinds = report.bloat.map((b) => b.kind).sort();
    expect(kinds).toContain('duplicate');
    expect(kinds).toContain('heavy-chunk');
    expect(kinds).toContain('solo-hot');

    const dup = report.bloat.find((b) => b.kind === 'duplicate');
    expect(dup?.modules).toEqual(['src/shared/lib/utils.ts']);
    expect(dup?.chunks.sort()).toEqual(['admin', 'main']);

    const heavy = report.bloat.find((b) => b.kind === 'heavy-chunk');
    expect(heavy?.chunks).toEqual(['main']);

    const solo = report.bloat.find((b) => b.kind === 'solo-hot');
    expect(solo?.modules).toEqual(['src/shared/big.ts']);
    expect(solo?.detail?.sharePercent).toBeGreaterThan(70);
  });

  it('respects custom thresholds', () => {
    const modules = [mod('src/x.ts')];
    const stats = parseBundleStats(
      {
        chunks: [
          {
            id: 'a',
            files: ['a.js'],
            size: 100_000,
            modules: [{ name: 'src/x.ts', size: 100_000 }],
          },
        ],
      },
      { rootPath: '/repo' },
    );

    const report = analyzeBundle({
      modules,
      stats,
      thresholds: { heavyChunkBytes: 50_000 },
    });

    expect(report.bloat.some((b) => b.kind === 'heavy-chunk')).toBe(true);
  });

  it('does not flag unmapped paths', () => {
    const modules = [mod('src/known.ts')];
    const stats = parseBundleStats(
      {
        chunks: [
          {
            id: 'main',
            files: ['main.js'],
            size: 600_000,
            modules: [{ name: 'node_modules/foo/index.js', size: 600_000 }],
          },
        ],
      },
      { rootPath: '/repo' },
    );

    const report = analyzeBundle({ modules, stats });
    // heavy-chunk still fires (about chunk size) but not solo-hot (no internal modules).
    expect(report.bloat.some((b) => b.kind === 'solo-hot')).toBe(false);
    expect(Object.keys(report.moduleToChunks)).toHaveLength(0);
  });
});

describe('analyzeBundle: barrel-leak (graph × bundle)', () => {
  const siblings = Array.from({ length: 8 }, (_, i) => `src/ui/C${i + 1}.ts`);
  const barrelModules = [
    mod('src/ui/index.ts'),
    ...siblings.map((s) => mod(s)),
    mod('src/app/Page.tsx'),
  ];
  const barrelEdges = [
    ...siblings.map((s) => ({
      from: 'src/ui/index.ts',
      to: s,
      kind: 'static' as const,
      specifier: `./${s.slice('src/ui/'.length, -'.ts'.length)}`,
      resolved: true,
    })),
    {
      from: 'src/app/Page.tsx',
      to: 'src/ui/index.ts',
      kind: 'static' as const,
      specifier: '@/ui',
      resolved: true,
    },
  ];

  it('flags a barrel that pulls its whole directory into one chunk', () => {
    const stats = parseBundleStats(
      {
        chunks: [
          {
            id: 'main',
            files: ['main.js'],
            size: 100_000,
            modules: [
              { name: 'src/ui/index.ts', size: 1_000 },
              ...siblings.map((s) => ({ name: s, size: 5_000 })),
              { name: 'src/app/Page.tsx', size: 2_000 },
            ],
          },
        ],
      },
      { rootPath: '/repo' },
    );
    const report = analyzeBundle({ modules: barrelModules, edges: barrelEdges, stats });
    const leak = report.bloat.find((b) => b.kind === 'barrel-leak');
    expect(leak).toBeDefined();
    expect(leak?.modules).toEqual(['src/ui/index.ts']);
    expect(leak?.detail?.moduleCount).toBe(8);
    expect(leak?.detail?.sizeBytes).toBe(40_000);
  });

  it('does not flag when only a few siblings co-locate with the barrel', () => {
    const stats = parseBundleStats(
      {
        chunks: [
          {
            id: 'main',
            files: ['main.js'],
            size: 30_000,
            modules: [
              { name: 'src/ui/index.ts', size: 1_000 },
              ...siblings.slice(0, 3).map((s) => ({ name: s, size: 5_000 })),
            ],
          },
          {
            id: 'other',
            files: ['other.js'],
            size: 25_000,
            modules: siblings.slice(3).map((s) => ({ name: s, size: 5_000 })),
          },
        ],
      },
      { rootPath: '/repo' },
    );
    const report = analyzeBundle({ modules: barrelModules, edges: barrelEdges, stats });
    expect(report.bloat.some((b) => b.kind === 'barrel-leak')).toBe(false);
  });

  it('skips barrel-leak detection when no edges are supplied', () => {
    const stats = parseBundleStats(
      {
        chunks: [
          {
            id: 'main',
            files: ['main.js'],
            size: 100_000,
            modules: [
              { name: 'src/ui/index.ts', size: 1_000 },
              ...siblings.map((s) => ({ name: s, size: 5_000 })),
            ],
          },
        ],
      },
      { rootPath: '/repo' },
    );
    const report = analyzeBundle({ modules: barrelModules, stats });
    expect(report.bloat.some((b) => b.kind === 'barrel-leak')).toBe(false);
  });
});
