// RSC / server-client boundary detection.

import { describe, expect, it } from 'vitest';

import { classifyModuleRuntime, detectRscLeaks } from '../rsc';
import { analyze } from '../index';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';
import type { DependencyEdge, ModuleNode } from '../types';

function mod(
  id: string,
  runtime: ModuleNode['runtime'] = 'shared',
  opts: { isServerActions?: boolean } = {},
): ModuleNode {
  return {
    id,
    absPath: id,
    kind: 'unknown',
    language: 'ts',
    loc: 10,
    exports: [],
    isInfra: false,
    runtime,
    ...(opts.isServerActions ? { isServerActions: true } : {}),
  };
}

function edge(from: string, to: string, kind: DependencyEdge['kind'] = 'static'): DependencyEdge {
  return { from, to, kind, specifier: to, resolved: true };
}

describe('classifyModuleRuntime', () => {
  it('directive prologue beats path conventions', () => {
    expect(
      classifyModuleRuntime({
        relPath: 'app/components/Form.tsx',
        framework: 'next',
        directives: ['use client'],
      }),
    ).toBe('client');

    expect(
      classifyModuleRuntime({
        relPath: 'lib/util.ts',
        framework: 'unknown',
        directives: ['use server'],
      }),
    ).toBe('server');
  });

  it("importing the 'server-only' package marks the module server (any framework)", () => {
    expect(
      classifyModuleRuntime({
        relPath: 'lib/secret.ts',
        framework: 'unknown',
        importsServerOnly: true,
      }),
    ).toBe('server');
  });

  it("importing the 'client-only' package marks the module client", () => {
    expect(
      classifyModuleRuntime({
        relPath: 'lib/browser.ts',
        framework: 'next',
        importsClientOnly: true,
      }),
    ).toBe('client');
  });

  it('Next App Router defaults to server, pages/api server-only', () => {
    expect(classifyModuleRuntime({ relPath: 'app/page.tsx', framework: 'next' })).toBe('server');
    expect(classifyModuleRuntime({ relPath: 'pages/api/hello.ts', framework: 'next' })).toBe(
      'server',
    );
    expect(classifyModuleRuntime({ relPath: 'lib/util.ts', framework: 'next' })).toBe('shared');
  });

  it('Nuxt server/ folder is server', () => {
    expect(classifyModuleRuntime({ relPath: 'server/api/hello.ts', framework: 'nuxt' })).toBe(
      'server',
    );
    expect(classifyModuleRuntime({ relPath: 'pages/index.vue', framework: 'nuxt' })).toBe('shared');
  });

  it('SvelteKit conventions: +server.ts, *.server.ts, +page.svelte', () => {
    expect(
      classifyModuleRuntime({ relPath: 'src/routes/api/+server.ts', framework: 'svelte' }),
    ).toBe('server');
    expect(
      classifyModuleRuntime({
        relPath: 'src/routes/dashboard/+page.server.ts',
        framework: 'svelte',
      }),
    ).toBe('server');
    expect(classifyModuleRuntime({ relPath: 'src/routes/+page.svelte', framework: 'svelte' })).toBe(
      'client',
    );
    expect(classifyModuleRuntime({ relPath: 'src/routes/+page.ts', framework: 'svelte' })).toBe(
      'shared',
    );
  });
});

describe('detectRscLeaks', () => {
  it('flags client -> server but allows server -> client (RSC composition is legal)', () => {
    const modules = [
      mod('app/page.tsx', 'server'),
      mod('app/Form.tsx', 'client'),
      mod('lib/db.ts', 'server'),
      mod('components/Button.tsx', 'client'),
    ];
    const edges = [
      edge('app/Form.tsx', 'lib/db.ts'), // leak
      edge('app/page.tsx', 'components/Button.tsx'), // legal: server renders client
      edge('app/page.tsx', 'lib/db.ts'), // legal: server -> server
    ];

    const leaks = detectRscLeaks({ modules, edges });
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.kind).toBe('rsc-leak');
    expect(leaks[0]?.edge?.from).toBe('app/Form.tsx');
    expect(leaks[0]?.edge?.to).toBe('lib/db.ts');
  });

  it("does not flag a client importing a 'use server' Server Actions module", () => {
    // The ubiquitous Next.js app-router pattern: a client component imports
    // server actions (forms/mutations). Next compiles them into RPC references;
    // nothing server-only ships to the browser, so this is not a leak.
    const modules = [
      mod('components/cart/modal.tsx', 'client'),
      mod('components/cart/actions.ts', 'server', { isServerActions: true }),
    ];
    const edges = [edge('components/cart/modal.tsx', 'components/cart/actions.ts')];
    expect(detectRscLeaks({ modules, edges })).toHaveLength(0);
  });

  it("still flags client -> server-only when the server module is not 'use server'", () => {
    const modules = [
      mod('app/Form.tsx', 'client'),
      mod('lib/secret.ts', 'server'), // server via server-only / convention, no 'use server'
    ];
    const edges = [edge('app/Form.tsx', 'lib/secret.ts')];
    const leaks = detectRscLeaks({ modules, edges });
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.edge?.to).toBe('lib/secret.ts');
  });

  it("does not flag a transitive client -> shared -> 'use server' actions chain", () => {
    const modules = [
      mod('app/Form.tsx', 'client'),
      mod('lib/index.ts', 'shared'), // barrel
      mod('lib/actions.ts', 'server', { isServerActions: true }),
    ];
    const edges = [edge('app/Form.tsx', 'lib/index.ts'), edge('lib/index.ts', 'lib/actions.ts')];
    expect(detectRscLeaks({ modules, edges })).toHaveLength(0);
  });

  it("flags a client component importing a module poisoned with 'server-only'", async () => {
    const fs = createInMemoryFileSource('/repo', {
      'package.json': JSON.stringify({ dependencies: { next: '^14.0.0' } }),
      'app/Form.tsx':
        "'use client';\nimport { getSecret } from '../lib/secret';\nexport default function F(){ return getSecret(); }\n",
      'lib/secret.ts': "import 'server-only';\nexport const getSecret = () => 1;\n",
    });
    const scan = await analyze(fs);
    const leaks = scan.contractViolations.filter((v) => v.kind === 'rsc-leak');
    expect(
      leaks.some((l) => l.edge?.from === 'app/Form.tsx' && l.edge?.to === 'lib/secret.ts'),
    ).toBe(true);
  });

  it('flags a transitive leak: client -> shared barrel -> server', () => {
    const modules = [
      mod('app/Form.tsx', 'client'),
      mod('lib/index.ts', 'shared'), // barrel
      mod('lib/db.ts', 'server'),
    ];
    const edges = [
      edge('app/Form.tsx', 'lib/index.ts'), // client -> shared (legal alone)
      edge('lib/index.ts', 'lib/db.ts'), // shared re-exports server
    ];
    const leaks = detectRscLeaks({ modules, edges });
    const transitive = leaks.find(
      (l) => l.edge?.from === 'app/Form.tsx' && l.edge?.to === 'lib/db.ts',
    );
    expect(transitive).toBeDefined();
    expect(transitive?.kind).toBe('rsc-leak');
  });

  it('does not flag a client -> shared chain that never reaches a server module', () => {
    const modules = [
      mod('app/Form.tsx', 'client'),
      mod('lib/index.ts', 'shared'),
      mod('lib/util.ts', 'shared'),
    ];
    const edges = [edge('app/Form.tsx', 'lib/index.ts'), edge('lib/index.ts', 'lib/util.ts')];
    expect(detectRscLeaks({ modules, edges })).toHaveLength(0);
  });

  it('does not double-report when a client directly imports a server module', () => {
    const modules = [mod('app/Form.tsx', 'client'), mod('lib/db.ts', 'server')];
    const edges = [edge('app/Form.tsx', 'lib/db.ts')];
    const leaks = detectRscLeaks({ modules, edges }).filter(
      (l) => l.edge?.from === 'app/Form.tsx' && l.edge?.to === 'lib/db.ts',
    );
    expect(leaks).toHaveLength(1);
  });

  it('does not flag type-only edges or shared modules', () => {
    const modules = [mod('a.ts', 'client'), mod('b.ts', 'server'), mod('shared.ts', 'shared')];
    const edges = [
      edge('a.ts', 'b.ts', 'type-only'),
      edge('a.ts', 'shared.ts'),
      edge('b.ts', 'shared.ts'),
    ];
    expect(detectRscLeaks({ modules, edges })).toHaveLength(0);
  });
});

describe('rsc-leak end-to-end', () => {
  it('surfaces client->server-only import as a contract violation in analyze()', async () => {
    const fs = createInMemoryFileSource('/repo', {
      'package.json': JSON.stringify({ name: 'x' }),
      'app/page.tsx':
        "import { db } from '../lib/db';\nexport default function P(){ return db; }\n",
      'app/Form.tsx':
        "'use client';\nimport { db } from '../lib/db';\nexport default function F(){ return db; }\n",
      'lib/db.ts': "import 'server-only';\nexport const db = 1;\n",
    });

    const scan = await analyze(fs);
    const leaks = scan.contractViolations.filter((v) => v.kind === 'rsc-leak');
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.some((l) => l.edge?.from === 'app/Form.tsx' && l.edge?.to === 'lib/db.ts')).toBe(
      true,
    );
  });

  it("does not flag a client importing a 'use server' actions module in analyze()", async () => {
    // Mirrors vercel/commerce: components/cart/modal.tsx ('use client') imports
    // components/cart/actions.ts ('use server'). This must not be an rsc-leak.
    const fs = createInMemoryFileSource('/repo', {
      'package.json': JSON.stringify({ dependencies: { next: '^14.0.0' } }),
      'components/cart/modal.tsx':
        "'use client';\nimport { addItem } from './actions';\nexport default function M(){ return addItem; }\n",
      'components/cart/actions.ts': "'use server';\nexport async function addItem(){ return 1; }\n",
    });

    const scan = await analyze(fs);
    const leaks = scan.contractViolations.filter((v) => v.kind === 'rsc-leak');
    expect(
      leaks.some(
        (l) =>
          l.edge?.from === 'components/cart/modal.tsx' &&
          l.edge?.to === 'components/cart/actions.ts',
      ),
    ).toBe(false);
  });
});
