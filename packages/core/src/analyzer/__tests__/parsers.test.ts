import { describe, it, expect } from 'vitest';
import { createTsParser } from '../parsers/tsParser';
import { createVueParser } from '../parsers/vueParser';
import { createParserRegistry, isParseFailure } from '../parsers';

describe('tsParser', () => {
  it('captures static, dynamic, type-only and side-effect imports', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'sample.ts',
      language: 'ts',
      content: `
        import a from './a';
        import type { B } from './b';
        import './style.css';
        import { type C, d } from './cd';
        const lazy = () => import('./lazy');
        export { e } from './e';
      `,
    });
    const byKind = (k: string) =>
      result.imports.filter((i) => i.kind === k).map((i) => i.specifier);
    expect(byKind('static').sort()).toEqual(['./a', './cd', './e'].sort());
    expect(byKind('type-only')).toContain('./b');
    expect(byKind('side-effect')).toContain('./style.css');
    expect(byKind('dynamic')).toContain('./lazy');
  });

  it('detects defineStore', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'store.ts',
      language: 'ts',
      content: `import { defineStore } from 'pinia'; export const s = defineStore('x', {});`,
    });
    expect(result.hasDefineStore).toBe(true);
  });

  it('lists exports', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'x.ts',
      language: 'ts',
      content: `export const a = 1; export function b() {} export default {};`,
    });
    expect(result.exports).toContain('a');
    expect(result.exports).toContain('b');
  });

  it('extracts static prefix from template-literal dynamic imports', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'loader.ts',
      language: 'ts',
      content: `
        async function load(name: string) {
          return import(\`./mfes/\${name}/index\`);
        }
      `,
    });
    const dyn = result.imports.filter((i) => i.kind === 'dynamic');
    expect(dyn).toHaveLength(1);
    expect(dyn[0]?.specifier).toBe('./mfes/');
    expect(dyn[0]?.pattern).toBe('prefix');
  });

  it('extracts static prefix from string-concat dynamic imports', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'loader.ts',
      language: 'ts',
      content: `
        function load(name: string) {
          return import('./mfes/' + name + '/index');
        }
      `,
    });
    const dyn = result.imports.filter((i) => i.kind === 'dynamic');
    expect(dyn).toHaveLength(1);
    expect(dyn[0]?.specifier).toBe('./mfes/');
    expect(dyn[0]?.pattern).toBe('prefix');
  });

  it('keeps literal pattern for plain dynamic imports', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'a.ts',
      language: 'ts',
      content: `const m = import('./b');`,
    });
    const dyn = result.imports.filter((i) => i.kind === 'dynamic');
    expect(dyn[0]?.pattern).toBeUndefined();
    expect(dyn[0]?.specifier).toBe('./b');
  });

  it('captures CJS require() as a static import', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'a.cjs',
      language: 'js',
      content: `const x = require('./b'); const y = require('lodash');`,
    });
    const statics = result.imports.filter((i) => i.kind === 'static');
    expect(statics.map((i) => i.specifier).sort()).toEqual(['./b', 'lodash']);
  });

  it('captures import.meta.glob string-literal patterns', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'router.ts',
      language: 'ts',
      content: `const pages = import.meta.glob('./pages/**/*.vue', { eager: false });`,
    });
    const globs = result.imports.filter((i) => i.pattern === 'glob');
    expect(globs).toHaveLength(1);
    expect(globs[0]?.specifier).toBe('./pages/**/*.vue');
    expect(globs[0]?.kind).toBe('dynamic');
  });

  it('captures import.meta.glob with array-of-patterns', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'router.ts',
      language: 'ts',
      content: `const m = import.meta.glob(['./a/**/*.ts', './b/**/*.ts']);`,
    });
    const globs = result.imports.filter((i) => i.pattern === 'glob');
    expect(globs.map((g) => g.specifier).sort()).toEqual(['./a/**/*.ts', './b/**/*.ts']);
  });

  it('captures import.meta.globEager patterns as eager glob imports', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'modules.ts',
      language: 'ts',
      content: `const modules = import.meta.globEager('./modules/**/*.ts');`,
    });
    const globs = result.imports.filter((i) => i.pattern === 'glob');
    expect(globs).toHaveLength(1);
    expect(globs[0]).toMatchObject({
      specifier: './modules/**/*.ts',
      kind: 'dynamic',
      confidence: 'medium',
      globEager: true,
    });
  });

  it('captures namespace re-export names', () => {
    const parser = createParserRegistry();
    const result = parser.parse({
      relPath: 'src/index.ts',
      content: "export * as FeatureApi from './feature';",
    });
    if (isParseFailure(result)) throw new Error('parse failed');
    expect(result.exports).toContain('FeatureApi');
    expect(result.imports).toEqual([{ specifier: './feature', kind: 'static' }]);
  });

  it('skips dynamic imports with no static prefix', () => {
    const p = createTsParser();
    const result = p.parse({
      relPath: 'a.ts',
      language: 'ts',
      content: `function load(p: string) { return import(p); }`,
    });
    expect(result.imports.filter((i) => i.kind === 'dynamic')).toHaveLength(0);
  });
});

describe('vueParser', () => {
  it('extracts imports from <script setup>', () => {
    const tp = createTsParser();
    const vp = createVueParser(tp);
    const result = vp.parse({
      relPath: 'Foo.vue',
      content: `<template><div /></template>
<script setup lang="ts">
import Bar from '@/Bar.vue';
import { useFoo } from '@/composables/useFoo';
</script>`,
    });
    expect(result.language).toBe('vue');
    const specs = result.imports.map((i) => i.specifier);
    expect(specs).toContain('@/Bar.vue');
    expect(specs).toContain('@/composables/useFoo');
  });
});
