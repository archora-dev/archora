import { describe, it, expect } from 'vitest';
import { createParserRegistry, isParseFailure } from '../parsers';
import { analyze } from '../index';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';
import type { ParsedFile } from '../types';

const parseVue = (relPath: string, content: string): ParsedFile => {
  const registry = createParserRegistry({ framework: 'vue' });
  const r = registry.parse({ relPath, content });
  if (isParseFailure(r)) throw new Error(`parse failed: ${r.reason}`);
  return r;
};

describe('vueParser: templateRefs extraction', () => {
  it('extracts PascalCase component tags from <template>', () => {
    const sfc = `<script setup lang="ts">
const x = 1;
</script>
<template>
  <AppHeader />
  <div><MyButton>click</MyButton></div>
</template>`;
    const file = parseVue('App.vue', sfc);
    expect(file.templateRefs).toEqual(expect.arrayContaining(['AppHeader', 'MyButton']));
  });

  it('normalizes kebab-case tags to PascalCase', () => {
    const sfc = `<script setup lang="ts"></script>
<template>
  <my-fancy-button />
</template>`;
    const file = parseVue('A.vue', sfc);
    expect(file.templateRefs).toContain('MyFancyButton');
  });

  it('excludes Vue / Vue Router built-in tags', () => {
    const sfc = `<script setup lang="ts"></script>
<template>
  <Transition><div /></Transition>
  <KeepAlive><RouterView /></KeepAlive>
  <Suspense><Teleport to="body"><RouterLink to="/x">x</RouterLink></Teleport></Suspense>
  <NuxtLink to="/y" />
  <ClientOnly />
  <UserCard />
</template>`;
    const file = parseVue('A.vue', sfc);
    expect(file.templateRefs).toEqual(['UserCard']);
  });

  it('excludes plain HTML elements (compiler-sfc tagType filter)', () => {
    const sfc = `<script setup lang="ts"></script>
<template>
  <div><span><button>x</button></span></div>
  <header><nav><ul><li>x</li></ul></nav></header>
</template>`;
    const file = parseVue('A.vue', sfc);
    expect(file.templateRefs ?? []).toEqual([]);
  });

  it('omits templateRefs entirely on .vue files without a template', () => {
    const sfc = `<script setup lang="ts">
export const x = 1;
</script>`;
    const file = parseVue('A.vue', sfc);
    expect(file.templateRefs).toBeUndefined();
  });

  it('deduplicates multiple usages of the same tag', () => {
    const sfc = `<script setup lang="ts"></script>
<template>
  <UserCard /><UserCard /><UserCard />
</template>`;
    const file = parseVue('A.vue', sfc);
    expect(file.templateRefs).toEqual(['UserCard']);
  });

  it('walks nested children', () => {
    const sfc = `<script setup lang="ts"></script>
<template>
  <div>
    <section>
      <article>
        <DeepCard />
      </article>
    </section>
  </div>
</template>`;
    const file = parseVue('A.vue', sfc);
    expect(file.templateRefs).toContain('DeepCard');
  });
});

describe('buildGraph: unplugin-vue-components auto-import resolution', () => {
  it('emits auto-import edges for src/components/*.vue referenced only in template', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'tsconfig.json': '{}',
      'src/main.ts': `import App from './App.vue';
const app = App;`,
      'src/App.vue': `<script setup lang="ts"></script>
<template><AppHeader /><AppFooter /></template>`,
      'src/components/AppHeader.vue': `<template><header /></template>`,
      'src/components/AppFooter.vue': `<template><footer /></template>`,
    });
    const result = await analyze(src);
    const fromApp = result.edges.filter((e) => e.from === 'src/App.vue');
    const autoImports = fromApp.filter((e) => e.kind === 'auto-import');
    expect(autoImports.map((e) => ({ to: e.to, specifier: e.specifier }))).toEqual(
      expect.arrayContaining([
        { to: 'src/components/AppHeader.vue', specifier: 'AppHeader' },
        { to: 'src/components/AppFooter.vue', specifier: 'AppFooter' },
      ]),
    );
  });

  it('does NOT emit auto-import edge when the script already imports the component', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'tsconfig.json': '{}',
      'src/App.vue': `<script setup lang="ts">
import AppHeader from './components/AppHeader.vue';
</script>
<template><AppHeader /></template>`,
      'src/components/AppHeader.vue': `<template><header /></template>`,
    });
    const result = await analyze(src);
    const edges = result.edges.filter(
      (e) => e.from === 'src/App.vue' && e.to === 'src/components/AppHeader.vue',
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]?.kind).toBe('static');
  });

  it('does NOT match components outside src/components/ (default unplugin convention)', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'tsconfig.json': '{}',
      'src/App.vue': `<script setup lang="ts"></script>
<template><HomeView /></template>`,
      'src/views/HomeView.vue': `<template><main /></template>`,
    });
    const result = await analyze(src);
    const autoImports = result.edges.filter((e) => e.kind === 'auto-import');
    expect(autoImports).toEqual([]);
  });

  it('does not emit a self-edge when a component template references itself', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'tsconfig.json': '{}',
      'src/components/Tree.vue': `<script setup lang="ts">
defineProps<{ depth: number }>();
</script>
<template><div><Tree v-if="depth" :depth="depth - 1" /></div></template>`,
    });
    const result = await analyze(src);
    const selfEdges = result.edges.filter(
      (e) => e.from === 'src/components/Tree.vue' && e.to === 'src/components/Tree.vue',
    );
    expect(selfEdges).toEqual([]);
  });

  it('matches kebab-case template usage to the PascalCase file in registry', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'tsconfig.json': '{}',
      'src/App.vue': `<script setup lang="ts"></script>
<template><my-button /></template>`,
      'src/components/MyButton.vue': `<template><button /></template>`,
    });
    const result = await analyze(src);
    const autoImports = result.edges.filter(
      (e) => e.from === 'src/App.vue' && e.kind === 'auto-import',
    );
    expect(autoImports.map((e) => e.to)).toEqual(['src/components/MyButton.vue']);
  });
});
