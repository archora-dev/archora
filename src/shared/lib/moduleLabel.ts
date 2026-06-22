/**
 * Derives a short, unambiguous display label for a module path: the last two
 * path segments (`<parentFolder>/<basename>`). Repos that name every file the
 * same inside per-feature folders (VueUse: `useMouse/index.ts`, `useMouse/demo.vue`,
 * `useMouse/component.ts`) would otherwise render as a wall of identical
 * `index.ts` / `demo.vue` labels. Falls back to the bare name when there is no
 * parent segment.
 *
 * Examples:
 *   packages/core/useMouse/index.ts   → useMouse/index.ts
 *   packages/core/useMouse/demo.vue   → useMouse/demo.vue
 *   src/features/auth/useAuth.ts      → auth/useAuth.ts
 *   main.ts                           → main.ts
 */
export function moduleLabel(id: string): string {
  const parts = id.split('/');
  const basename = parts.at(-1) ?? id;
  const parent = parts.at(-2);
  return parent !== undefined && parent !== '' ? `${parent}/${basename}` : basename;
}
