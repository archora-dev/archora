import { describe, it, expect } from 'vitest';
import { applyTypeOnlyFix, ApplyTypeOnlyFixError } from '../applyTypeOnlyFix';

describe('applyTypeOnlyFix', () => {
  it('flips a fully type-only named import', () => {
    const src = `import { Foo, Bar } from './b';\nexport function f(x: Foo, y: Bar) { void x; void y; }\n`;
    const r = applyTypeOnlyFix({
      filePath: 'a.ts',
      content: src,
      language: 'ts',
      specifier: './b',
      bindings: ['Foo', 'Bar'],
    });
    expect(r.patchedContent).toBe(
      `import type { Foo, Bar } from './b';\nexport function f(x: Foo, y: Bar) { void x; void y; }\n`,
    );
    expect(r.hunks).toHaveLength(1);
    expect(r.hunks[0]?.before).toBe(`import { Foo, Bar } from './b';`);
    expect(r.hunks[0]?.after).toBe(`import type { Foo, Bar } from './b';`);
  });

  it('flips a default-only import', () => {
    const src = `import Foo from './b';\nexport type X = Foo;\n`;
    const r = applyTypeOnlyFix({
      filePath: 'a.ts',
      content: src,
      language: 'ts',
      specifier: './b',
      bindings: ['Foo'],
    });
    expect(r.patchedContent).toBe(`import type Foo from './b';\nexport type X = Foo;\n`);
  });

  it('flips a namespace import', () => {
    const src = `import * as B from './b';\nexport type X = B.Foo;\n`;
    const r = applyTypeOnlyFix({
      filePath: 'a.ts',
      content: src,
      language: 'ts',
      specifier: './b',
      bindings: ['B'],
    });
    expect(r.patchedContent).toBe(`import type * as B from './b';\nexport type X = B.Foo;\n`);
  });

  it('splits a partially type-only named import', () => {
    const src = `import { Foo, Bar } from './b';\nexport function f(x: Foo) { return Bar(x); }\n`;
    const r = applyTypeOnlyFix({
      filePath: 'a.ts',
      content: src,
      language: 'ts',
      specifier: './b',
      bindings: ['Foo'],
    });
    expect(r.patchedContent).toBe(
      `import { Bar } from './b';\nimport type { Foo } from './b';\nexport function f(x: Foo) { return Bar(x); }\n`,
    );
  });

  it('preserves leading indentation when splitting (e.g. inside a script block)', () => {
    const src = `  import { Foo, Bar } from './b';\n  export function f(x: Foo) { return Bar(x); }\n`;
    const r = applyTypeOnlyFix({
      filePath: 'a.ts',
      content: src,
      language: 'ts',
      specifier: './b',
      bindings: ['Foo'],
    });
    expect(r.patchedContent).toBe(
      `  import { Bar } from './b';\n  import type { Foo } from './b';\n  export function f(x: Foo) { return Bar(x); }\n`,
    );
  });

  it('splits mixed default + named when only named is type-only', () => {
    const src = `import Foo, { Bar } from './b';\nFoo();\nexport type X = Bar;\n`;
    const r = applyTypeOnlyFix({
      filePath: 'a.ts',
      content: src,
      language: 'ts',
      specifier: './b',
      bindings: ['Bar'],
    });
    expect(r.patchedContent).toBe(
      `import Foo from './b';\nimport type { Bar } from './b';\nFoo();\nexport type X = Bar;\n`,
    );
  });

  it('rewrites import inside Vue <script setup>', () => {
    const src = [
      `<template><div /></template>`,
      `<script setup lang="ts">`,
      `import { Foo } from './b';`,
      `defineProps<{ x: Foo }>();`,
      `</script>`,
      ``,
    ].join('\n');
    const r = applyTypeOnlyFix({
      filePath: 'a.vue',
      content: src,
      language: 'vue',
      specifier: './b',
      bindings: ['Foo'],
    });
    expect(r.patchedContent).toContain(`import type { Foo } from './b';`);
    expect(r.patchedContent).not.toContain(`import { Foo } from './b';`);
    // structure preserved
    expect(r.patchedContent).toContain(`<template><div /></template>`);
    expect(r.patchedContent).toContain(`defineProps<{ x: Foo }>();`);
  });

  it('rewrites import inside Svelte <script>', () => {
    const src = [
      `<script lang="ts">`,
      `  import { Foo } from './b';`,
      `  export let x: Foo;`,
      `</script>`,
      `<div>{x}</div>`,
      ``,
    ].join('\n');
    const r = applyTypeOnlyFix({
      filePath: 'a.svelte',
      content: src,
      language: 'svelte',
      specifier: './b',
      bindings: ['Foo'],
    });
    expect(r.patchedContent).toContain(`import type { Foo } from './b';`);
    expect(r.patchedContent).not.toContain(`import { Foo } from './b';`);
    expect(r.patchedContent).toContain(`<div>{x}</div>`);
  });

  it('throws already-type-only when import is already a type import', () => {
    const src = `import type { Foo } from './b';\nexport type X = Foo;\n`;
    expect(() =>
      applyTypeOnlyFix({
        filePath: 'a.ts',
        content: src,
        language: 'ts',
        specifier: './b',
        bindings: ['Foo'],
      }),
    ).toThrow(ApplyTypeOnlyFixError);
  });

  it('throws import-not-found when specifier is missing', () => {
    const src = `import { Foo } from './b';\n`;
    let err: unknown = null;
    try {
      applyTypeOnlyFix({
        filePath: 'a.ts',
        content: src,
        language: 'ts',
        specifier: './c',
        bindings: ['Foo'],
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApplyTypeOnlyFixError);
    expect((err as ApplyTypeOnlyFixError).code).toBe('import-not-found');
  });

  it('preserves double-quote style and semicolon-less source', () => {
    const src = `import { Foo, Bar } from "./b"\nexport function f(x: Foo) { return Bar(x) }\n`;
    const r = applyTypeOnlyFix({
      filePath: 'a.ts',
      content: src,
      language: 'ts',
      specifier: './b',
      bindings: ['Foo'],
    });
    expect(r.patchedContent).toBe(
      `import { Bar } from "./b"\nimport type { Foo } from "./b"\nexport function f(x: Foo) { return Bar(x) }\n`,
    );
  });
});
