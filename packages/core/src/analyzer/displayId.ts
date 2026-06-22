import type { ModuleId } from './types';

/**
 * Filenames that can't stand on their own - dozens of `index.ts` /
 * `+page.svelte` files in a SvelteKit project, several `main.ts` in a
 * monorepo. For these we prepend the parent directory so the user can tell
 * which file we mean. Specific names (`UserService.ts`, `cn.ts`, ...) stay
 * bare to keep insight titles compact.
 */
const AMBIGUOUS_BASE =
  /^(?:index|main|app|root)\.[a-z]+$|^\+(?:page|layout|server|error)(?:\.[a-z]+)*$/u;

export function displayShortId(id: ModuleId): string {
  const i = id.lastIndexOf('/');
  if (i === -1) return id;
  const base = id.slice(i + 1);
  if (!AMBIGUOUS_BASE.test(base)) return base;
  const parent = id.slice(0, i);
  const j = parent.lastIndexOf('/');
  return j === -1 ? id : `${parent.slice(j + 1)}/${base}`;
}
