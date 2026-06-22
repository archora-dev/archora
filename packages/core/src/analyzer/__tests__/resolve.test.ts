import { describe, it, expect } from 'vitest';
import { createNodeFsFileSource } from '../sources/nodeFsFileSource';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';
import { createResolver, parseTsconfigPaths, parseViteAliases } from '../resolve';
import { loadAliases } from '../loadAliases';
import { fixturePath } from './_paths';
import type { ProjectRef } from '../types';

describe('resolve', () => {
  it('parses tsconfig paths', () => {
    const aliases = parseTsconfigPaths(
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    );
    expect(aliases).toEqual([{ prefix: '@', targets: ['src'] }]);
  });

  it('resolves a tsconfig wildcard whose target has an interior star to the package index', async () => {
    const src = createInMemoryFileSource('/p', {
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@x/*': ['pkgs/*/src'], '@x/legacy': ['pkgs/legacy/src'] },
        },
      }),
      'pkgs/foo/src/index.ts': 'export const foo = 1;',
      'pkgs/legacy/src/index.ts': 'export const legacy = 1;',
      'src/main.ts': "import { foo } from '@x/foo';",
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
      tsconfigPath: 'tsconfig.json',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    // `@x/*` -> `pkgs/*/src`: the captured `foo` is substituted at the star,
    // then directory->index resolution lands on the package index file.
    expect(await r.resolve('@x/foo', 'src/main.ts')).toBe('pkgs/foo/src/index.ts');
    // an exact tsconfig path (no star) shadows the wildcard for its own key.
    expect(await r.resolve('@x/legacy', 'src/main.ts')).toBe('pkgs/legacy/src/index.ts');
  });

  it('resolves @/ alias to src/*.ts and *.vue', async () => {
    const src = await createNodeFsFileSource({ rootPath: fixturePath('sample-vue-app') });
    const r = createResolver(src, { aliases: parseTsconfigPaths(await src.read('tsconfig.json')) });
    expect(await r.resolve('@/utils/date', 'src/main.ts')).toBe('src/utils/date.ts');
    expect(await r.resolve('@/components/UserCard.vue', 'src/pages/Home.vue')).toBe(
      'src/components/UserCard.vue',
    );
    expect(await r.resolve('@/router', 'src/main.ts')).toBe('src/router/index.ts');
  });

  it('resolves jsconfig paths', async () => {
    const src = createInMemoryFileSource('/p', {
      'jsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      }),
      'src/main.js': "import util from '@/lib/util';",
      'src/lib/util.js': 'export default 1;',
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
      tsconfigPath: 'jsconfig.json',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    expect(await r.resolve('@/lib/util', 'src/main.js')).toBe('src/lib/util.js');
  });

  it('resolves an alias whose target is itself an alias (alias chain)', async () => {
    const src = createInMemoryFileSource('/p', {
      'src/a/foo.ts': 'export const x = 1;',
      'src/entry.ts': "import { x } from '@b/foo';",
    });
    const r = createResolver(src, {
      aliases: [
        { prefix: '@b', targets: ['@a'] },
        { prefix: '@a', targets: ['src/a'] },
      ],
    });
    expect(await r.resolve('@b/foo', 'src/entry.ts')).toBe('src/a/foo.ts');
  });

  it('does not loop on a cyclic alias chain', async () => {
    const src = createInMemoryFileSource('/p', {
      'src/entry.ts': "import { x } from '@x/foo';",
    });
    const r = createResolver(src, {
      aliases: [
        { prefix: '@x', targets: ['@y'] },
        { prefix: '@y', targets: ['@x'] },
      ],
    });
    expect(await r.resolve('@x/foo', 'src/entry.ts')).toBeNull();
  });

  it('resolves relative imports', async () => {
    const src = await createNodeFsFileSource({ rootPath: fixturePath('sample-cycles') });
    const r = createResolver(src, { aliases: [] });
    expect(await r.resolve('./b', 'src/a.ts')).toBe('src/b.ts');
  });

  // real-world: `import { card } from '..'` from src/modules/card/buttons/x.ts
  // should land on src/modules/card/index.ts. previously misclassified as
  // a bare specifier and routed through alias resolution (returning null).
  it('resolves "." and ".." to the parent folder index', async () => {
    const src = createInMemoryFileSource('/p', {
      'src/modules/card/index.ts': 'export const card = 1;',
      'src/modules/card/buttons/cancel.ts': "import { card } from '..';",
      'src/modules/card/buttons/index.ts': 'export {};',
      'src/modules/card/buttons/sibling.ts': "import './';",
    });
    const r = createResolver(src, { aliases: [] });
    expect(await r.resolve('..', 'src/modules/card/buttons/cancel.ts')).toBe(
      'src/modules/card/index.ts',
    );
    expect(await r.resolve('./', 'src/modules/card/buttons/sibling.ts')).toBe(
      'src/modules/card/buttons/index.ts',
    );
    expect(await r.resolve('.', 'src/modules/card/buttons/sibling.ts')).toBe(
      'src/modules/card/buttons/index.ts',
    );
  });

  it('resolves index.mjs and index.cjs folder imports', async () => {
    const src = createInMemoryFileSource('/p', {
      'src/esm/index.mjs': 'export const x = 1;',
      'src/cjs/index.cjs': 'exports.y = 1;',
      'src/main.ts': "import './esm'; import './cjs';",
    });
    const r = createResolver(src, { aliases: [] });
    expect(await r.resolve('./esm', 'src/main.ts')).toBe('src/esm/index.mjs');
    expect(await r.resolve('./cjs', 'src/main.ts')).toBe('src/cjs/index.cjs');
  });

  it('loads SvelteKit and Nuxt default aliases', async () => {
    const src = createInMemoryFileSource('/p', {
      'src/lib/api.ts': 'export const api = 1;',
      'components/Card.vue': '<template />',
    });
    const svelteProject: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'svelte',
    };
    const nuxtProject: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'nuxt',
    };
    const svelte = createResolver(src, { aliases: await loadAliases(src, svelteProject) });
    const nuxt = createResolver(src, { aliases: await loadAliases(src, nuxtProject) });
    expect(await svelte.resolve('$lib/api', 'src/routes/+page.svelte')).toBe('src/lib/api.ts');
    expect(await nuxt.resolve('~/components/Card.vue', 'app.vue')).toBe('components/Card.vue');
    expect(await nuxt.resolve('@/components/Card.vue', 'app.vue')).toBe('components/Card.vue');
  });

  it('loads workspace package aliases from nested package.json files', async () => {
    const src = createInMemoryFileSource('/p', {
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui' }),
      'packages/ui/src/index.ts': 'export const Button = 1;',
      'packages/ui/src/theme.ts': 'export const theme = 1;',
      'src/main.ts': "import { Button } from '@acme/ui'; import { theme } from '@acme/ui/theme';",
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    expect(await r.resolve('@acme/ui', 'src/main.ts')).toBe('packages/ui/src/index.ts');
    expect(await r.resolve('@acme/ui/theme', 'src/main.ts')).toBe('packages/ui/src/theme.ts');
  });

  it('resolves workspace package exports and blocks private subpaths when exports exist', async () => {
    const src = createInMemoryFileSource('/p', {
      'packages/ui/package.json': JSON.stringify({
        name: '@acme/ui',
        exports: {
          '.': { import: './src/index.ts', default: './src/index.ts' },
          './theme': './src/theme.ts',
        },
      }),
      'packages/ui/src/index.ts': 'export const Button = 1;',
      'packages/ui/src/theme.ts': 'export const theme = 1;',
      'packages/ui/src/private.ts': 'export const privateApi = 1;',
      'src/main.ts': '',
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    expect(await r.resolve('@acme/ui', 'src/main.ts')).toBe('packages/ui/src/index.ts');
    expect(await r.resolve('@acme/ui/theme', 'src/main.ts')).toBe('packages/ui/src/theme.ts');
    expect(await r.resolve('@acme/ui/private', 'src/main.ts')).toBeNull();
  });

  it('falls through conditional exports when the first condition target is not a source file', async () => {
    const src = createInMemoryFileSource('/p', {
      'packages/ui/package.json': JSON.stringify({
        name: '@acme/ui',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './src/index.ts',
            default: './src/fallback.ts',
          },
        },
      }),
      'packages/ui/src/index.ts': 'export const Button = 1;',
      'packages/ui/src/fallback.ts': 'export const fallback = 1;',
      'src/main.ts': '',
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    expect(await r.resolve('@acme/ui', 'src/main.ts')).toBe('packages/ui/src/index.ts');
  });

  it('resolves package root conditional exports without subpath keys', async () => {
    const src = createInMemoryFileSource('/p', {
      'packages/ui/package.json': JSON.stringify({
        name: '@acme/ui',
        exports: {
          import: './src/index.ts',
          default: './src/fallback.ts',
        },
      }),
      'packages/ui/src/index.ts': 'export const Button = 1;',
      'packages/ui/src/fallback.ts': 'export const fallback = 1;',
      'src/main.ts': '',
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    expect(await r.resolve('@acme/ui', 'src/main.ts')).toBe('packages/ui/src/index.ts');
    expect(await r.resolve('@acme/ui/private', 'src/main.ts')).toBeNull();
  });

  it('resolves package imports from root package.json', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({
        imports: {
          '#internal': { import: './src/internal.ts', default: './src/internal.ts' },
        },
      }),
      'src/internal.ts': 'export const internal = 1;',
      'src/main.ts': '',
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    expect(await r.resolve('#internal', 'src/main.ts')).toBe('src/internal.ts');
  });

  it('resolves workspace package exports and imports wildcard entries', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({
        imports: {
          '#domain/*': './src/domain/*.ts',
        },
      }),
      'packages/ui/package.json': JSON.stringify({
        name: '@acme/ui',
        exports: {
          '.': './src/index.ts',
          './components/*': './src/components/*.vue',
        },
      }),
      'packages/ui/src/index.ts': 'export const ui = 1;',
      'packages/ui/src/components/Button.vue': '<template />',
      'packages/ui/src/private/Button.vue': '<template />',
      'src/domain/order.ts': 'export const order = 1;',
      'src/main.ts': '',
    });
    const project: ProjectRef = {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
    };
    const r = createResolver(src, { aliases: await loadAliases(src, project) });
    expect(await r.resolve('@acme/ui/components/Button', 'src/main.ts')).toBe(
      'packages/ui/src/components/Button.vue',
    );
    expect(await r.resolve('@acme/ui/private/Button', 'src/main.ts')).toBeNull();
    expect(await r.resolve('#domain/order', 'src/main.ts')).toBe('src/domain/order.ts');
  });

  it('parses vite alias object form with path.resolve', () => {
    const aliases = parseViteAliases(`
      import { defineConfig } from 'vite';
      import path from 'node:path';
      export default defineConfig({
        resolve: {
          alias: {
            '@': path.resolve(__dirname, 'src'),
            '~ui': '/packages/ui/src',
          },
        },
      });
    `);
    const map = Object.fromEntries(aliases.map((a) => [a.prefix, a.targets]));
    expect(map['@']).toEqual(['src']);
    expect(map['~ui']).toEqual(['/packages/ui/src']);
  });

  it('parses vite alias array form with fileURLToPath', () => {
    const aliases = parseViteAliases(`
      import { fileURLToPath, URL } from 'node:url';
      export default {
        resolve: {
          alias: [
            { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
          ],
        },
      };
    `);
    expect(aliases).toEqual([{ prefix: '@', targets: ['src'] }]);
  });

  it('returns null for unresolved bare imports', async () => {
    const src = await createNodeFsFileSource({ rootPath: fixturePath('sample-vue-app') });
    const r = createResolver(src, { aliases: [] });
    expect(await r.resolve('nonexistent-pkg', 'src/main.ts')).toBeNull();
  });
});
