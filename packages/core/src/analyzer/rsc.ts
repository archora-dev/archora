// RSC / server-client boundary detection.
//
// Two pieces:
//   1. `classifyModuleRuntime` - decides whether a module is server / client /
//      shared, based on directives parsed from the file plus framework
//      conventions (Next app/, Nuxt server/, SvelteKit `+server.ts`/
//      `*.server.*`).
//   2. `detectRscLeaks` - emits a `ContractViolation` (`kind: 'rsc-leak'`)
//      for every client->server boundary crossing: a direct edge, and a
//      transitive one (client -> shared chain -> server), the classic
//      barrel/re-export leak that fails the Next build.
//
// Runtime classification precedence: directives (`'use client'` / `'use server'`)
// win, then the `server-only` / `client-only` packages (Next's own poison-package
// enforcement - an explicit, framework-independent runtime declaration), then
// framework folder conventions. Passing server-only *data* as props into a client
// component needs data-flow analysis and is out of scope (would be high-FP).

import type { ContractViolation } from './contracts';
import type { DependencyEdge, ModuleId, ModuleNode, ModuleRuntime, ParsedFile } from './types';
import type { Framework } from './detect';

export interface ClassifyRuntimeInput {
  relPath: string;
  framework: Framework;
  directives?: ParsedFile['directives'];
  /** File imports the `server-only` package (Next's poison package — throws if bundled for the client). */
  importsServerOnly?: boolean;
  /** File imports the `client-only` package. */
  importsClientOnly?: boolean;
}

export function classifyModuleRuntime(input: ClassifyRuntimeInput): ModuleRuntime {
  // 1. directives win.
  if (input.directives && input.directives.length > 0) {
    if (input.directives.includes('use server')) return 'server';
    if (input.directives.includes('use client')) return 'client';
  }

  // 2. `server-only` / `client-only` packages — an explicit runtime declaration,
  //    framework-independent (this is Next RSC's own enforcement mechanism, not a convention).
  if (input.importsServerOnly) return 'server';
  if (input.importsClientOnly) return 'client';

  const path = input.relPath.replace(/\\/gu, '/');

  // 3. SvelteKit conventions (work for any framework value because users
  //    pin them by file name, not framework detection):
  //    - `+server.ts` / `+server.js` -> endpoint, server only
  //    - `*.server.ts` (and `+page.server.ts`, `+layout.server.ts`) -> server
  //    - `+page.svelte`, `+layout.svelte` -> client
  //    - `+page.ts`, `+layout.ts` -> shared (universal)
  if (/(^|\/)\+server\.[mc]?[jt]s$/u.test(path)) return 'server';
  if (/\.server\.[mc]?[jt]sx?$/u.test(path)) return 'server';
  if (/\.client\.[mc]?[jt]sx?$/u.test(path)) return 'client';
  if (/(^|\/)\+(?:page|layout)\.svelte$/u.test(path)) return 'client';

  // 4. Framework-specific folder conventions.
  if (input.framework === 'next') {
    // Next App Router: `app/` files are server components by default.
    // The 'use client' directive (handled above) opts a tree into client.
    // `pages/api/**` is server-only (legacy router).
    if (/(^|\/)pages\/api\//u.test(path)) return 'server';
    if (/(^|\/)app\//u.test(path)) return 'server';
  }

  if (input.framework === 'nuxt') {
    // Nuxt: `server/**` is server-side (API routes, plugins, middleware).
    // `pages/`, `components/`, `composables/`, `app.vue` are universal but
    // primarily client; default to 'shared' so we don't flag SSR-friendly
    // imports of utilities.
    if (/(^|\/)server\//u.test(path)) return 'server';
  }

  return 'shared';
}

/**
 * A `'use server'` directive marks a Next.js Server Actions module: it is
 * server runtime, but it is *meant* to be imported from client components
 * (forms/mutations), so a client->this edge is not an `rsc-leak`. Distinct from
 * server-only modules (`server-only` package / server component / endpoint
 * conventions), whose import from a client is a real leak. Directives win over
 * conventions in `classifyModuleRuntime`, so the directive is an authoritative
 * reason here.
 */
export function isServerActionsModule(directives?: ParsedFile['directives']): boolean {
  return !!directives && directives.includes('use server');
}

export interface DetectRscLeaksInput {
  modules: ModuleNode[];
  edges: DependencyEdge[];
}

/**
 * One violation per offending edge. `kind: 'rsc-leak'` lets the UI/CLI
 * single it out from user-defined contract rules.
 */
export function detectRscLeaks(input: DetectRscLeaksInput): ContractViolation[] {
  const moduleById = new Map<ModuleId, ModuleNode>();
  for (const m of input.modules) moduleById.set(m.id, m);

  const out: ContractViolation[] = [];
  let serial = 0;
  const directLeaks = new Set<string>();

  for (const e of input.edges) {
    if (e.kind === 'type-only') continue;
    const from = moduleById.get(e.from);
    const to = moduleById.get(e.to);
    if (!from || !to) continue;
    // Server Actions (`'use server'`) are server runtime but designed to be
    // imported from client components — that edge is the intended Next.js
    // pattern, not a leak.
    if (to.isServerActions) continue;
    const leak = classifyLeak(from.runtime ?? 'shared', to.runtime ?? 'shared');
    if (!leak) continue;
    directLeaks.add(`${from.id}->${to.id}`);
    out.push({
      id: `rsc-leak:${serial++}:${e.from}\u0001${e.to}`,
      kind: 'rsc-leak',
      ruleName: 'rsc-leak',
      severity: 'error',
      message: leak.message(from.id, to.id),
      modules: [from.id, to.id],
      edge: { from: from.id, to: to.id, specifier: e.specifier },
    });
  }

  // Transitive leaks: a client module pulls server-only code through a chain of
  // shared modules (the classic barrel/re-export leak — in Next this is a build
  // error, since the shared chain plus the server code lands in the client bundle).
  // Walk from each client module through shared intermediates only; sink = server.
  // Direct client→server edges are already handled above.
  const adj = new Map<ModuleId, ModuleId[]>();
  for (const e of input.edges) {
    if (e.kind === 'type-only') continue;
    let bucket = adj.get(e.from);
    if (!bucket) {
      bucket = [];
      adj.set(e.from, bucket);
    }
    bucket.push(e.to);
  }
  const rt = (id: ModuleId): ModuleRuntime => moduleById.get(id)?.runtime ?? 'shared';
  const seenTransitive = new Set<string>();
  for (const c of input.modules) {
    if ((c.runtime ?? 'shared') !== 'client') continue;
    const visitedShared = new Set<ModuleId>();
    const queue: ModuleId[] = [];
    for (const to of adj.get(c.id) ?? []) {
      if (rt(to) === 'shared' && !visitedShared.has(to)) {
        visitedShared.add(to);
        queue.push(to);
      }
    }
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const to of adj.get(node) ?? []) {
        const toRt = rt(to);
        if (toRt === 'server' && !moduleById.get(to)?.isServerActions) {
          const key = `${c.id}->${to}`;
          if (directLeaks.has(key) || seenTransitive.has(key)) continue;
          seenTransitive.add(key);
          out.push({
            id: `rsc-leak:${serial++}:${key}`,
            kind: 'rsc-leak',
            ruleName: 'rsc-leak',
            severity: 'error',
            message: `client module "${c.id}" transitively imports server-only "${to}" through shared module(s)`,
            modules: [c.id, to],
            edge: { from: c.id, to, specifier: to },
          });
        } else if (toRt === 'shared' && !visitedShared.has(to)) {
          visitedShared.add(to);
          queue.push(to);
        }
      }
    }
  }
  return out;
}

interface LeakKind {
  message(from: ModuleId, to: ModuleId): string;
}

function classifyLeak(fromRt: ModuleRuntime, toRt: ModuleRuntime): LeakKind | null {
  // Only `client -> server` is a hard leak: importing server-only code from
  // a client bundle ships server-side dependencies (db drivers, secrets) to
  // the browser. The reverse (`server -> client`) is the standard pattern -
  // server components compose client components and the framework inserts
  // the boundary automatically. `shared` is universal on either side.
  if (fromRt === 'client' && toRt === 'server') {
    return {
      message: (f, t) => `client module "${f}" imports server-only "${t}"`,
    };
  }
  return null;
}
