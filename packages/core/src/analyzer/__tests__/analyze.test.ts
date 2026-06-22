import { describe, it, expect } from 'vitest';
import { analyze } from '..';
import { createNodeFsFileSource } from '../sources/nodeFsFileSource';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';
import { fixturePath } from './_paths';

describe('analyze: sample-cycles', () => {
  it('detects two cycles: a<->b and c->d->e->c', async () => {
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-cycles') });
    const result = await analyze(source);

    expect(result.modules.length).toBe(7);
    expect(result.cycles).toHaveLength(2);

    const lengths = result.cycles.map((c) => c.length).sort();
    expect(lengths).toEqual([2, 3]);

    const direct = result.cycles.find((c) => c.severity === 'direct');
    expect(direct?.modules.sort()).toEqual(['src/a.ts', 'src/b.ts']);

    const indirect = result.cycles.find((c) => c.severity === 'indirect');
    expect(indirect?.modules.sort()).toEqual(['src/c.ts', 'src/d.ts', 'src/e.ts']);
  });

  it('stamps every cycle with a concrete suggestedBreakpoint edge', async () => {
    // Fix-plan contract: every cycle must carry one concrete edge so the
    // inspector, fix-plan JSON and HTML report cite the same break.
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-cycles') });
    const result = await analyze(source);

    for (const cycle of result.cycles) {
      expect(cycle.suggestedBreakpoint, `cycle ${cycle.id}`).toBeDefined();
      const { from, to } = cycle.suggestedBreakpoint!;
      expect(cycle.modules).toContain(from);
      expect(cycle.modules).toContain(to);
      // the analyzer must cite a real edge (not just a module pair).
      const edge = result.edges.find(
        (e) => e.from === from && e.to === to && e.kind !== 'type-only',
      );
      expect(edge, `edge ${from} -> ${to}`).toBeDefined();
    }
  });
});

describe('analyze: sample-vue-app', () => {
  it('produces a coherent ScanResult', async () => {
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-vue-app') });
    const result = await analyze(source);

    expect(result.project.detectedFramework).toBe('vue');
    expect(result.project.tsconfigPath).toBe('tsconfig.json');

    expect(result.modules.length).toBeGreaterThanOrEqual(20);

    const ids = new Set(result.modules.map((m) => m.id));
    expect(ids.has('src/main.ts')).toBe(true);
    expect(ids.has('src/App.vue')).toBe(true);
    expect(ids.has('src/stores/userStore.ts')).toBe(true);

    const userStore = result.modules.find((m) => m.id === 'src/stores/userStore.ts');
    expect(userStore?.kind).toBe('store');

    const useUsers = result.modules.find((m) => m.id === 'src/composables/useUsers.ts');
    expect(useUsers?.kind).toBe('composable');

    const main = result.modules.find((m) => m.id === 'src/main.ts');
    expect(main?.kind).toBe('entry');

    expect(result.modules.find((m) => m.id === 'vite.config.ts')).toBeUndefined();

    expect(
      result.cycles.some(
        (c) =>
          c.modules.includes('src/services/errors.ts') &&
          c.modules.includes('src/services/logger.ts'),
      ),
    ).toBe(true);
  });

  it('resolves @/ alias edges', async () => {
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-vue-app') });
    const result = await analyze(source);

    const fromMain = result.edges.filter((e) => e.from === 'src/main.ts');
    const targets = fromMain.map((e) => e.to).sort();
    expect(targets).toContain('src/App.vue');
    expect(targets).toContain('src/router/index.ts');
    expect(targets).toContain('src/services/init.ts');
  });

  it('classifies dynamic imports from router as edges', async () => {
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-vue-app') });
    const result = await analyze(source);
    const fromRouter = result.edges.filter((e) => e.from === 'src/router/index.ts');
    expect(fromRouter.every((e) => e.kind === 'dynamic')).toBe(true);
    const targets = fromRouter.map((e) => e.to);
    expect(targets).toContain('src/pages/Home.vue');
    expect(targets).toContain('src/pages/Users.vue');
  });

  it('ranks hot zones with cycle members near the top', async () => {
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-vue-app') });
    const result = await analyze(source);
    expect(result.hotZones.length).toBeGreaterThan(0);
    expect(result.hotZones).toContain('src/services/logger.ts');
  });
});

describe('analyze: synth-mfe-loader (template-literal dynamic imports)', () => {
  it('connects MFE clusters through the dynamic loader prefix', async () => {
    const root = `${fixturePath('reference')}/synth-mfe-loader`;
    const source = await createNodeFsFileSource({ rootPath: root });
    const result = await analyze(source);

    // every src/mfes/* file should have an inbound edge from the loader
    const fromLoader = result.edges.filter(
      (e) => e.from === 'src/utils/dynamicMfeLoader.ts' && e.kind === 'dynamic',
    );
    const targets = new Set(fromLoader.map((e) => e.to));
    expect(targets.has('src/mfes/users/index.ts')).toBe(true);
    expect(targets.has('src/mfes/users/UsersWidget.ts')).toBe(true);
    expect(targets.has('src/mfes/products/index.ts')).toBe(true);
    expect(targets.has('src/mfes/products/ProductsWidget.ts')).toBe(true);
  });

  it('does not flag MFE files as an isolated cluster', async () => {
    const root = `${fixturePath('reference')}/synth-mfe-loader`;
    const source = await createNodeFsFileSource({ rootPath: root });
    const result = await analyze(source);

    const isolated = result.recommendations.filter((r) => r.kind === 'isolated-cluster');
    expect(isolated).toHaveLength(0);
  });
});

describe('analyze: sample-extends-tsconfig', () => {
  it('follows tsconfig extends to load paths', async () => {
    const source = await createNodeFsFileSource({
      rootPath: fixturePath('sample-extends-tsconfig'),
    });
    const result = await analyze(source);
    const fromMain = result.edges.filter((e) => e.from === 'src/main.ts');
    expect(fromMain.map((e) => e.to)).toContain('src/util/hello.ts');
  });
});

describe('analyze: parser/resolver hardening', () => {
  it('detects jsconfig.json and resolves its paths without tsconfig.json', async () => {
    const source = createInMemoryFileSource('/p', {
      'jsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      }),
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'src/main.js': "import { util } from '@/lib/util';",
      'src/lib/util.js': 'export const util = 1;',
    });
    const result = await analyze(source);
    expect(result.project.tsconfigPath).toBe('jsconfig.json');
    expect(result.warnings.some((w) => w.code === 'tsconfig-missing')).toBe(false);
    expect(result.edges.map((e) => e.to)).toContain('src/lib/util.js');
  });

  it('applies negative import.meta.glob patterns as exclusions', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': '{}',
      'src/main.ts': "const routes = import.meta.glob(['./routes/*.ts', '!./routes/*.spec.ts']);",
      'src/routes/home.ts': 'export const home = 1;',
      'src/routes/home.spec.ts': 'export const test = 1;',
    });
    const result = await analyze(source);
    const fromMain = result.edges.filter((e) => e.from === 'src/main.ts').map((e) => e.to);
    expect(fromMain).toContain('src/routes/home.ts');
    expect(fromMain).not.toContain('src/routes/home.spec.ts');
    expect(result.warnings.some((w) => w.message.includes('!./routes/*.spec.ts'))).toBe(false);
    const fact = result.parserFacts?.find((f) => f.relPath === 'src/main.ts');
    const negative = fact?.imports.find((imp) => imp.specifier === '!./routes/*.spec.ts');
    expect(negative).toMatchObject({
      resolutionKind: 'glob',
      confidence: 'low',
      approximate: true,
      negative: true,
      globEager: false,
    });
  });

  it('expands import.meta.glob patterns through tsconfig aliases', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      }),
      'src/main.ts': "const reports = import.meta.glob('@/reports/**/*.ts');",
      'src/reports/monthly.ts': 'export const report = 1;',
    });
    const result = await analyze(source);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'src/main.ts',
          to: 'src/reports/monthly.ts',
          resolutionKind: 'glob',
        }),
      ]),
    );
    expect(result.warnings.some((w) => w.message.includes('@/reports/**/*.ts'))).toBe(false);
  });

  it('keeps asset import.meta.glob patterns out of graph warnings', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      }),
      'src/main.ts': "const reports = import.meta.glob('@/reports/**/report.html');",
    });
    const result = await analyze(source);

    expect(result.edges).toHaveLength(0);
    expect(result.warnings.some((w) => w.message.includes('@/reports/**/report.html'))).toBe(false);
    const fact = result.parserFacts?.find((f) => f.relPath === 'src/main.ts');
    expect(fact?.imports[0]).toMatchObject({
      specifier: '@/reports/**/report.html',
      resolutionKind: 'glob',
    });
  });

  it('records import.meta.glob eager/import metadata as approximate parser facts', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': '{}',
      'src/main.ts':
        "const routes = import.meta.glob('./routes/*.ts', { eager: true, import: 'default' });",
      'src/routes/home.ts': 'export default 1;',
    });
    const result = await analyze(source);
    const edge = result.edges.find((e) => e.from === 'src/main.ts');
    expect(edge).toMatchObject({
      to: 'src/routes/home.ts',
      resolutionKind: 'glob',
      confidence: 'medium',
      approximate: true,
    });
    const fact = result.parserFacts?.find((f) => f.relPath === 'src/main.ts');
    expect(fact?.imports[0]).toMatchObject({
      specifier: './routes/*.ts',
      resolutionKind: 'glob',
      confidence: 'medium',
      approximate: true,
      globEager: true,
      globImport: 'default',
    });
  });

  it('keeps asset imports as parser facts without graph edges or unresolved warnings', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': '{}',
      'src/main.ts':
        "import './style.css'; import data from './data.json'; import logo from './logo.svg';",
    });
    const result = await analyze(source);
    expect(result.edges).toHaveLength(0);
    expect(result.warnings.filter((w) => w.code === 'resolve-failed')).toHaveLength(0);
    const fact = result.parserFacts?.find((f) => f.relPath === 'src/main.ts');
    expect(fact?.assetFacts.map((a) => a.assetKind).sort()).toEqual(['image', 'json', 'style']);
  });

  it('resolves package exports without allowing private package subpaths', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': '{}',
      'packages/ui/package.json': JSON.stringify({
        name: '@acme/ui',
        exports: {
          '.': './src/index.ts',
          './theme': { import: './src/theme.ts', default: './src/theme.ts' },
        },
      }),
      'packages/ui/src/index.ts': 'export const Button = 1;',
      'packages/ui/src/theme.ts': 'export const theme = 1;',
      'packages/ui/src/private.ts': 'export const privateApi = 1;',
      'src/main.ts': "import '@acme/ui'; import '@acme/ui/theme'; import '@acme/ui/private';",
    });
    const result = await analyze(source);
    const targets = result.edges.filter((e) => e.from === 'src/main.ts').map((e) => e.to);
    expect(targets).toContain('packages/ui/src/index.ts');
    expect(targets).toContain('packages/ui/src/theme.ts');
    expect(targets).not.toContain('packages/ui/src/private.ts');
    expect(result.warnings.some((w) => w.message.includes('@acme/ui/private'))).toBe(true);
  });

  it('honours analysis.generated `exclude` mode by dropping matched files at discovery', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': '{}',
      '.archora.json': JSON.stringify({
        analysis: {
          generated: { mode: 'exclude', patterns: ['src/recruit/openapi/**'] },
        },
      }),
      'src/main.ts': "import { api } from './recruit/openapi/api';\n",
      'src/recruit/openapi/api.ts': "export const api = '';\n",
    });
    const result = await analyze(source);
    expect(result.modules.map((m) => m.id)).not.toContain('src/recruit/openapi/api.ts');
  });

  it('honours analysis.generated `classify` mode by tagging matched modules', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': '{}',
      '.archora.json': JSON.stringify({
        analysis: {
          generated: {
            mode: 'classify',
            patterns: ['src/recruit/openapi/**'],
            presets: ['generated-folder'],
          },
        },
      }),
      'src/main.ts':
        "import { api } from './recruit/openapi/api';\nimport { x } from './__generated__/x';\n",
      'src/recruit/openapi/api.ts': "export const api = '';\n",
      'src/__generated__/x.ts': 'export const x = 1;\n',
      'src/util.ts': 'export const u = 1;\n',
    });
    const result = await analyze(source);
    const byId = new Map(result.modules.map((m) => [m.id, m] as const));
    expect(byId.get('src/recruit/openapi/api.ts')?.isGenerated).toBe(true);
    expect(byId.get('src/__generated__/x.ts')?.isGenerated).toBe(true);
    expect(byId.get('src/main.ts')?.isGenerated).toBeUndefined();
    expect(byId.get('src/util.ts')?.isGenerated).toBeUndefined();
  });

  it('applies signal suppressions from .archora.json', async () => {
    const files = {
      'tsconfig.json': '{}',
      '.archora.json': JSON.stringify({
        contracts: {
          boundaries: [
            {
              name: 'shared-boundary',
              from: 'src/shared/**',
              mode: 'must-not',
              to: 'src/features/**',
            },
          ],
        },
      }),
      'src/shared/api.ts':
        "import { session } from '../features/auth/session';\nexport const api = session;\n",
      'src/features/auth/session.ts': "export const session = 'ok';\n",
    };
    const first = await analyze(createInMemoryFileSource('/p', files));
    const stableKey = first.signals?.find(
      (signal) => signal.kind === 'contract-violation',
    )?.stableKey;
    if (!stableKey) throw new Error('contract signal not emitted');

    const suppressed = await analyze(
      createInMemoryFileSource('/p', {
        ...files,
        '.archora.json': JSON.stringify({
          contracts: {
            boundaries: [
              {
                name: 'shared-boundary',
                from: 'src/shared/**',
                mode: 'must-not',
                to: 'src/features/**',
              },
            ],
          },
          signals: {
            suppressions: [
              {
                stableKey,
                reason: 'Accepted during shared API extraction.',
                createdAt: '2026-05-22T00:00:00.000Z',
              },
            ],
          },
        }),
      }),
    );

    const signal = suppressed.signals?.find((item) => item.stableKey === stableKey);
    expect(signal).toMatchObject({
      suppressed: true,
      suppressionReason: 'Accepted during shared API extraction.',
    });
  });

  it('emits safe Nuxt auto-import framework facts for conventional folders', async () => {
    const source = createInMemoryFileSource('/p', {
      'tsconfig.json': '{}',
      'package.json': JSON.stringify({ dependencies: { nuxt: '^3.0.0' } }),
      'components/AppButton.vue': '<template />',
      'composables/useUser.ts': 'export const useUser = () => null;',
    });
    const result = await analyze(source);
    const kinds = result.parserFacts?.flatMap((fact) => fact.frameworkFacts.map((x) => x.kind));
    expect(kinds).toContain('nuxt-auto-component');
    expect(kinds).toContain('nuxt-auto-composable');
  });

  it('emits route facts for Next and Nuxt conventional route files', async () => {
    const next = await analyze(
      createInMemoryFileSource('/next', {
        'tsconfig.json': '{}',
        'package.json': JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } }),
        'app/page.tsx': 'export default function Page() { return null; }',
        'app/layout.tsx': 'export default function Layout() { return null; }',
        'app/api/users/route.ts': 'export function GET() {}',
        'pages/index.tsx': 'export default function Home() { return null; }',
        'pages/api/legacy.ts': 'export default function handler() {}',
        'middleware.ts': 'export function middleware() {}',
      }),
    );
    expect(routeKind(next, 'app/page.tsx')).toContain('page');
    expect(routeKind(next, 'app/layout.tsx')).toContain('layout');
    expect(routeKind(next, 'app/api/users/route.ts')).toContain('api');
    expect(routeKind(next, 'pages/index.tsx')).toContain('page');
    expect(routeKind(next, 'pages/api/legacy.ts')).toContain('api');
    expect(routeKind(next, 'middleware.ts')).toContain('middleware');

    const nuxt = await analyze(
      createInMemoryFileSource('/nuxt', {
        'tsconfig.json': '{}',
        'package.json': JSON.stringify({ dependencies: { nuxt: '^3.0.0' } }),
        'pages/index.vue': '<template />',
        'layouts/default.vue': '<template />',
        'server/api/users.get.ts': 'export default defineEventHandler(() => null);',
        'middleware/auth.ts': 'export default defineNuxtRouteMiddleware(() => null);',
      }),
    );
    expect(routeKind(nuxt, 'pages/index.vue')).toContain('page');
    expect(routeKind(nuxt, 'layouts/default.vue')).toContain('layout');
    expect(routeKind(nuxt, 'server/api/users.get.ts')).toContain('api');
    expect(routeKind(nuxt, 'middleware/auth.ts')).toContain('middleware');
  });

  it('emits route facts for SvelteKit load files and TanStack route modules', async () => {
    const svelte = await analyze(
      createInMemoryFileSource('/svelte', {
        'tsconfig.json': '{}',
        'package.json': JSON.stringify({ devDependencies: { svelte: '^4.0.0' } }),
        'src/routes/+page.svelte': '<script>export let data;</script>',
        'src/routes/+page.ts': 'export const load = () => ({});',
        'src/routes/dashboard/+page.server.ts': 'export const load = () => ({});',
      }),
    );
    expect(routeKind(svelte, 'src/routes/+page.svelte')).toContain('page');
    expect(routeKind(svelte, 'src/routes/+page.ts')).toContain('page');
    expect(routeKind(svelte, 'src/routes/dashboard/+page.server.ts')).toContain('server-route');

    const tanstack = await analyze(
      createInMemoryFileSource('/tanstack', {
        'tsconfig.json': '{}',
        'package.json': JSON.stringify({
          dependencies: {
            react: '^18.0.0',
            '@tanstack/react-router': '^1.78.0',
          },
        }),
        'index.html': '<script type="module" src="/src/main.tsx"></script>',
        'src/main.tsx': "import { router } from './router'; console.log(router);",
        'src/router.tsx':
          "import { createRouter, createRootRoute } from '@tanstack/react-router'; export const router = createRouter({ routeTree: createRootRoute() });",
        'src/routes/__root.tsx': 'export function RootLayout() { return null; }',
        'src/routes/index.tsx': 'export function HomePage() { return null; }',
        'src/routes/dashboard.tsx': 'export function DashboardPage() { return null; }',
      }),
    );
    expect(routeKind(tanstack, 'src/routes/__root.tsx')).toContain('layout');
    expect(routeKind(tanstack, 'src/routes/index.tsx')).toContain('page');
    expect(routeKind(tanstack, 'src/routes/dashboard.tsx')).toContain('page');
  });
});

function routeKind(scan: Awaited<ReturnType<typeof analyze>>, relPath: string): string[] {
  return (
    scan.parserFacts
      ?.find((fact) => fact.relPath === relPath)
      ?.routeFacts.map((fact) => fact.routeKind) ?? []
  );
}

describe('analyze: phantom type-only cycles', () => {
  it('does not count a cycle whose feedback edge is a value-syntax type-only import', async () => {
    // b -> a imports `A` with value syntax but uses it only in a type position.
    // The compiler erases that import, so no runtime cycle exists. madge — even
    // with skipTypeImports — keys on syntax and still reports the cycle.
    const source = createInMemoryFileSource('/proj', {
      'package.json': JSON.stringify({ name: 'p', version: '0.0.0' }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
      'src/a.ts': [
        `import { runB } from './b';`,
        `export interface A { id: number }`,
        `export const a = runB();`,
        ``,
      ].join('\n'),
      'src/b.ts': [
        `import { A } from './a';`,
        `export function runB(): number { return 1; }`,
        `export const sizeOf = (x: A): number => x.id;`,
        ``,
      ].join('\n'),
    });
    const result = await analyze(source);

    expect(result.cycles.filter((c) => c.modules.length > 1)).toHaveLength(0);
    // the actionable hygiene hint stays — the import can be tightened to `type`.
    expect(result.recommendations.some((r) => r.kind === 'type-only-candidate')).toBe(true);
  });

  it('still reports a genuine value-level cycle', async () => {
    const source = createInMemoryFileSource('/proj', {
      'package.json': JSON.stringify({ name: 'p', version: '0.0.0' }),
      'tsconfig.json': '{}',
      'src/a.ts': `import { b } from './b';\nexport const a = (): number => b();\n`,
      'src/b.ts': `import { a } from './a';\nexport const b = (): number => a();\n`,
    });
    const result = await analyze(source);

    expect(result.cycles.some((c) => c.modules.length === 2)).toBe(true);
  });
});

describe('analyze: robustness to broken inputs', () => {
  it('does not crash on malformed files and still analyzes the valid ones', async () => {
    const source = createInMemoryFileSource('/proj', {
      'package.json': JSON.stringify({ name: 'p', version: '0.0.0', dependencies: { vue: '^3' } }),
      'tsconfig.json': '{}',
      'src/good.ts': `import { dep } from './dep';\nexport const good = (): number => dep();\n`,
      'src/dep.ts': `export const dep = (): number => 1;\n`,
      // unterminated string / garbage TS
      'src/brokenTs.ts': `export const x = "unterminated\nconst y = {{{ <<< @@@ ;`,
      // malformed Vue SFC (unclosed script, broken template)
      'src/Broken.vue': `<script setup lang="ts">\nimport { z from './nowhere'\n<template><div></span></template>`,
      // empty file
      'src/empty.ts': ``,
      // NUL / control bytes
      'src/binary.ts': `  not really code ￿`,
    });

    // Must resolve, not throw.
    const result = await analyze(source);

    // The valid pair survived and its edge was resolved despite broken neighbors.
    expect(result.modules.some((m) => m.id === 'src/good.ts')).toBe(true);
    expect(result.edges.some((e) => e.from === 'src/good.ts' && e.to === 'src/dep.ts')).toBe(true);
    // Warnings are accumulated, never thrown.
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('survives a file that exceeds the size cap without aborting the scan', async () => {
    const huge = `export const big = "${'x'.repeat(1_100_000)}";\n`;
    const source = createInMemoryFileSource('/proj', {
      'package.json': JSON.stringify({ name: 'p', version: '0.0.0' }),
      'tsconfig.json': '{}',
      'src/good.ts': `export const good = 1;\n`,
      'src/huge.ts': huge,
    });
    const result = await analyze(source);
    expect(result.modules.some((m) => m.id === 'src/good.ts')).toBe(true);
    expect(result.warnings.some((w) => w.file === 'src/huge.ts')).toBe(true);
  });
});
