import { describe, it, expect } from 'vitest';
import { analyze } from '../index';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';

const nuxtProject = (files: Record<string, string>) =>
  createInMemoryFileSource('/p', {
    'package.json': JSON.stringify({ dependencies: { nuxt: '^3.0.0' } }),
    'tsconfig.json': '{}',
    'app.vue': `<template><NuxtPage /></template>`,
    ...files,
  });

describe('buildGraph: Nuxt auto-import composable resolution', () => {
  it('emits an auto-import edge from a page using a composable by filename convention', async () => {
    const src = nuxtProject({
      'pages/index.vue': `<script setup lang="ts">
const n = useCounter();
</script>
<template><div>{{ n }}</div></template>`,
      'composables/useCounter.ts': `export default function useCounter() { return 0; }`,
    });
    const result = await analyze(src);
    const edge = result.edges.find(
      (e) => e.from === 'pages/index.vue' && e.to === 'composables/useCounter.ts',
    );
    expect(edge).toBeDefined();
    expect(edge?.kind).toBe('auto-import');
  });

  it('resolves a composable by its named export, not just the filename', async () => {
    const src = nuxtProject({
      'pages/index.vue': `<script setup lang="ts">
const s = useSession();
</script>
<template><div /></template>`,
      'composables/auth.ts': `export function useSession() { return null; }`,
    });
    const result = await analyze(src);
    const edge = result.edges.find(
      (e) => e.from === 'pages/index.vue' && e.to === 'composables/auth.ts',
    );
    expect(edge?.kind).toBe('auto-import');
    expect(edge?.specifier).toBe('useSession');
  });

  it('does NOT duplicate the edge when the composable is already statically imported', async () => {
    const src = nuxtProject({
      'pages/index.vue': `<script setup lang="ts">
import { useCounter } from '~/composables/useCounter';
const n = useCounter();
</script>
<template><div /></template>`,
      'composables/useCounter.ts': `export function useCounter() { return 0; }`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '~/*': ['./*'] } },
      }),
    });
    const result = await analyze(src);
    const edges = result.edges.filter(
      (e) => e.from === 'pages/index.vue' && e.to === 'composables/useCounter.ts',
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]?.kind).toBe('static');
  });

  it('does NOT create an edge for an identifier with no matching composable (Nuxt built-ins)', async () => {
    const src = nuxtProject({
      'pages/index.vue': `<script setup lang="ts">
const r = useRoute();
const f = useFetch('/api/x');
</script>
<template><div /></template>`,
      'composables/useCounter.ts': `export function useCounter() { return 0; }`,
    });
    const result = await analyze(src);
    const autoImports = result.edges.filter(
      (e) => e.from === 'pages/index.vue' && e.kind === 'auto-import',
    );
    expect(autoImports).toEqual([]);
  });

  it('does not emit a self-edge when a composable calls a sibling-named helper in its own file', async () => {
    const src = nuxtProject({
      'composables/useCounter.ts': `export function useCounter() { return useCounter; }`,
    });
    const result = await analyze(src);
    const selfEdges = result.edges.filter(
      (e) => e.from === 'composables/useCounter.ts' && e.to === 'composables/useCounter.ts',
    );
    expect(selfEdges).toEqual([]);
  });
});

describe('buildGraph: plain Vue (non-Nuxt) does not guess auto-import composables', () => {
  it('does not create composable auto-import edges without Nuxt (documented limitation)', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'tsconfig.json': '{}',
      'src/App.vue': `<script setup lang="ts">
const n = useCounter();
</script>
<template><div /></template>`,
      'src/composables/useCounter.ts': `export function useCounter() { return 0; }`,
    });
    const result = await analyze(src);
    const autoImports = result.edges.filter((e) => e.kind === 'auto-import');
    expect(autoImports).toEqual([]);
  });
});
