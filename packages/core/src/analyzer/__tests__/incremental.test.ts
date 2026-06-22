// Contract: incrementalAnalyze must either return a result equivalent to a
// full `analyze()` after applying the same changes to the source, or
// transparently delegate to analyze(). In both cases the downstream data
// (modules/edges/cycles/metrics) must match the post-state of the source.

import { describe, expect, it } from 'vitest';
import { analyze } from '../index';
import { incrementalAnalyze } from '../incremental';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';

function project(files: Record<string, string>) {
  return createInMemoryFileSource('/proj', {
    'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['src/*'] } } }),
    ...files,
  });
}

describe('incrementalAnalyze', () => {
  it('re-parsing a single file yields the same result as a full analyze of the post-state', async () => {
    const before = {
      'src/a.ts': "import { b } from '@/b';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
      'src/c.ts': 'export const c = 2;\n',
    };
    const prev = await analyze(project(before));

    const after = { ...before, 'src/a.ts': "import { c } from '@/c';\nexport const a = c;\n" };
    const expected = await analyze(project(after));
    const got = await incrementalAnalyze({
      prev,
      source: project(after),
      changedFiles: ['src/a.ts'],
    });

    // structural equality on the key fields (durationMs/scannedAt dropped)
    expect(sortEdges(got.edges)).toEqual(sortEdges(expected.edges));
    expect(got.modules.find((m) => m.id === 'src/a.ts')?.exports).toEqual(['a']);
    expect(got.cycles).toEqual(expected.cycles);
  });

  it('a change to module shape (loc, exports) lands in the result', async () => {
    const before = {
      'src/util.ts': 'export const x = 1;\n',
      'src/main.ts': "import { x } from '@/util';\nexport default x;\n",
    };
    const prev = await analyze(project(before));

    const after = {
      ...before,
      'src/util.ts': 'export const x = 1;\nexport const y = 2;\nexport const z = 3;\n',
    };
    const got = await incrementalAnalyze({
      prev,
      source: project(after),
      changedFiles: ['src/util.ts'],
    });

    const util = got.modules.find((m) => m.id === 'src/util.ts');
    expect(util?.exports.sort()).toEqual(['x', 'y', 'z']);
    expect(util?.loc).toBeGreaterThanOrEqual(3);
    expect(util?.loc).toBe(prev.modules.find((m) => m.id === 'src/util.ts')!.loc + 2);
  });

  it('a cycle appearing after an edit is detected', async () => {
    const before = {
      'src/a.ts': "import { b } from '@/b';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
    };
    const prev = await analyze(project(before));
    expect(prev.cycles).toHaveLength(0);

    const after = {
      ...before,
      'src/b.ts': "import { a } from '@/a';\nexport const b = a;\n",
    };
    const got = await incrementalAnalyze({
      prev,
      source: project(after),
      changedFiles: ['src/b.ts'],
    });
    expect(got.cycles).toHaveLength(1);
    expect(got.cycles[0]?.modules.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('a config file change → fallback to a full analyze', async () => {
    const before = {
      'src/a.ts': 'export const a = 1;\n',
    };
    const prev = await analyze(project(before));

    const newSource = createInMemoryFileSource('/proj', {
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~/*': ['src/*'] } } }),
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': "import { a } from '~/a';\nexport const b = a;\n",
    });
    const got = await incrementalAnalyze({
      prev,
      source: newSource,
      changedFiles: ['tsconfig.json', 'src/b.ts'],
    });
    // if it went through analyze, the new alias and new file are picked up
    expect(got.modules.map((m) => m.id).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(got.edges.find((e) => e.from === 'src/b.ts')?.to).toBe('src/a.ts');
  });

  it('a new file (not in prev) → fallback to a full analyze', async () => {
    const before = {
      'src/a.ts': 'export const a = 1;\n',
    };
    const prev = await analyze(project(before));

    const after = {
      ...before,
      'src/new.ts': "import { a } from '@/a';\nexport const n = a;\n",
    };
    const got = await incrementalAnalyze({
      prev,
      source: project(after),
      changedFiles: ['src/new.ts'],
    });
    expect(got.modules.map((m) => m.id).sort()).toEqual(['src/a.ts', 'src/new.ts']);
  });

  it('a deleted file → fallback to a full analyze', async () => {
    const before = {
      'src/a.ts': "import { b } from '@/b';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
    };
    const prev = await analyze(project(before));

    const after = { 'src/a.ts': 'export const a = 1;\n' };
    const got = await incrementalAnalyze({
      prev,
      source: project(after),
      changedFiles: ['src/b.ts'],
    });
    expect(got.modules.map((m) => m.id)).toEqual(['src/a.ts']);
  });

  it('incremental preserves runtime from the server-only package (== cold)', async () => {
    const before = {
      'package.json': JSON.stringify({ dependencies: { next: '^14.0.0' } }),
      'app/Form.tsx':
        "'use client';\nimport { getSecret } from '../lib/secret';\nexport default function F(){ return getSecret(); }\n",
      'lib/secret.ts': "import 'server-only';\nexport const getSecret = () => 1;\n",
    };
    const prev = await analyze(project(before));
    const after = {
      ...before,
      'lib/secret.ts': "import 'server-only';\n// touched\nexport const getSecret = () => 1;\n",
    };
    const expected = await analyze(project(after));
    const got = await incrementalAnalyze({
      prev,
      source: project(after),
      changedFiles: ['lib/secret.ts'],
    });
    expect(got.modules.find((m) => m.id === 'lib/secret.ts')?.runtime).toBe('server');
    const rsc = (v: { kind: string }): boolean => v.kind === 'rsc-leak';
    expect(got.contractViolations.filter(rsc).length).toBe(
      expected.contractViolations.filter(rsc).length,
    );
  });

  it('incremental preserves the Nuxt composable auto-import edge (== cold)', async () => {
    const before = {
      'package.json': JSON.stringify({ dependencies: { nuxt: '^3.0.0' } }),
      'app.vue': '<template><NuxtPage /></template>',
      'pages/index.vue':
        '<script setup lang="ts">\nconst n = useCounter();\n</script>\n<template><div>{{ n }}</div></template>',
      'composables/useCounter.ts': 'export function useCounter() { return 0; }',
    };
    const prev = await analyze(project(before));
    const after = {
      ...before,
      'pages/index.vue':
        '<script setup lang="ts">\n// touched\nconst n = useCounter();\n</script>\n<template><div>{{ n }}</div></template>',
    };
    const expected = await analyze(project(after));
    const got = await incrementalAnalyze({
      prev,
      source: project(after),
      changedFiles: ['pages/index.vue'],
    });
    expect(sortEdges(got.edges)).toEqual(sortEdges(expected.edges));
  });

  it('empty changedFiles → returns prev without doing work', async () => {
    const before = { 'src/a.ts': 'export const a = 1;\n' };
    const prev = await analyze(project(before));
    const got = await incrementalAnalyze({
      prev,
      source: project(before),
      changedFiles: [],
    });
    expect(got).toBe(prev);
  });
});

function sortEdges<T extends { from: string; to: string }>(edges: readonly T[]): T[] {
  return [...edges].sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
}
