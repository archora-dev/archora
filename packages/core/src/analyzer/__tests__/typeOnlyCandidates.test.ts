import { describe, it, expect } from 'vitest';
import { findTypeOnlyCandidates } from '../typeOnlyCandidates';
import type { FileSource } from '../fileSource';
import type { ModuleNode } from '../types';

function makeSource(files: Record<string, string>): FileSource {
  return {
    rootPath: '/virtual',
    list: async () => Object.keys(files),
    read: async (rel: string) => {
      const c = files[rel];
      if (c === undefined) throw new Error(`missing: ${rel}`);
      return c;
    },
    exists: async (rel: string) => rel in files,
  };
}

const mod = (id: string, language: 'ts' | 'js' | 'vue' | 'svelte' = 'ts'): ModuleNode => ({
  id,
  absPath: id,
  kind: 'unknown',
  language,
  loc: 1,
  exports: [],
  isInfra: false,
});

describe('findTypeOnlyCandidates', () => {
  it('flags import used only in TypeReference', () => {
    const source = makeSource({
      'a.ts': `
        import { Foo } from './b';
        export function take(x: Foo): void { void x; }
      `,
    });
    const modules = [mod('a.ts'), mod('b.ts')];
    return findTypeOnlyCandidates({
      edges: [{ from: 'a.ts', to: 'b.ts', specifier: './b' }],
      source,
      modules,
    }).then((cands) => {
      expect(cands).toHaveLength(1);
      expect(cands[0]?.bindings).toEqual(['Foo']);
    });
  });

  it('flags import used in HeritageClause', async () => {
    const source = makeSource({
      'a.ts': `
        import { Base } from './b';
        export class Derived extends Base {}
      `,
    });
    // class-extends is a value position, not a type position - should NOT flag
    const cands = await findTypeOnlyCandidates({
      edges: [{ from: 'a.ts', to: 'b.ts', specifier: './b' }],
      source,
      modules: [mod('a.ts'), mod('b.ts')],
    });
    expect(cands).toHaveLength(0);
  });

  it('flags interface heritage', async () => {
    const source = makeSource({
      'a.ts': `
        import type {} from 'unrelated';
        import { IFoo } from './b';
        export interface Bar extends IFoo {}
      `,
    });
    const cands = await findTypeOnlyCandidates({
      edges: [{ from: 'a.ts', to: 'b.ts', specifier: './b' }],
      source,
      modules: [mod('a.ts'), mod('b.ts')],
    });
    expect(cands).toHaveLength(1);
    expect(cands[0]?.bindings).toEqual(['IFoo']);
  });

  it('rejects when import is used as a value', async () => {
    const source = makeSource({
      'a.ts': `
        import { Foo } from './b';
        const x: Foo = new Foo();
      `,
    });
    const cands = await findTypeOnlyCandidates({
      edges: [{ from: 'a.ts', to: 'b.ts', specifier: './b' }],
      source,
      modules: [mod('a.ts'), mod('b.ts')],
    });
    expect(cands).toHaveLength(0);
  });

  it('rejects when used in typeof position (needs runtime value)', async () => {
    const source = makeSource({
      'a.ts': `
        import { router } from './b';
        type R = typeof router;
        export function use(): R { return router; }
      `,
    });
    const cands = await findTypeOnlyCandidates({
      edges: [{ from: 'a.ts', to: 'b.ts', specifier: './b' }],
      source,
      modules: [mod('a.ts'), mod('b.ts')],
    });
    expect(cands).toHaveLength(0);
  });

  it('skips already-type-only imports', async () => {
    const source = makeSource({
      'a.ts': `
        import type { Foo } from './b';
        export function take(x: Foo): void { void x; }
      `,
    });
    const cands = await findTypeOnlyCandidates({
      edges: [{ from: 'a.ts', to: 'b.ts', specifier: './b' }],
      source,
      modules: [mod('a.ts'), mod('b.ts')],
    });
    expect(cands).toHaveLength(0);
  });

  it('handles named import with mixed type-only specifier (ignores already-typed names)', async () => {
    const source = makeSource({
      'a.ts': `
        import { type Foo, doIt } from './b';
        doIt();
        export function take(x: Foo): void { void x; }
      `,
    });
    // doIt is a value - mixed usage, NOT all-types
    const cands = await findTypeOnlyCandidates({
      edges: [{ from: 'a.ts', to: 'b.ts', specifier: './b' }],
      source,
      modules: [mod('a.ts'), mod('b.ts')],
    });
    expect(cands).toHaveLength(0);
  });

  it('extracts script block from .vue file', async () => {
    const source = makeSource({
      'A.vue': `
        <script setup lang="ts">
        import type {} from 'noop';
        import { Foo } from './b';
        defineProps<{ x: Foo }>();
        </script>
        <template><div /></template>
      `,
    });
    const cands = await findTypeOnlyCandidates({
      edges: [{ from: 'A.vue', to: 'b.ts', specifier: './b' }],
      source,
      modules: [mod('A.vue', 'vue'), mod('b.ts')],
    });
    expect(cands).toHaveLength(1);
    expect(cands[0]?.bindings).toEqual(['Foo']);
  });
});
