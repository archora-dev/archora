import type { ModuleKind, ParsedFile } from './types';

// `.config.[ext]` is the catch-all that covers rollup/webpack/astro/svelte/
// playwright/cypress/jest/babel/tsup/etc. without listing each one. The
// explicit entries above it stay because they match flat names (`vite.config`)
// or non-`.config` conventions (`.eslintrc.cjs`).
const INFRA_PATTERNS = [
  /\.d\.ts$/u,
  /(^|\/)vite\.config\.[cm]?[jt]sx?$/u,
  /(^|\/)vitest\.config\.[cm]?[jt]sx?$/u,
  /(^|\/)eslint\.[a-z]+\.[cm]?[jt]sx?$/u,
  /(^|\/)\.eslintrc\.[a-z]+$/u,
  /(^|\/)postcss\.config\.[cm]?[jt]sx?$/u,
  /(^|\/)tailwind\.config\.[cm]?[jt]sx?$/u,
  /\.config\.[cm]?[jt]sx?$/u,
];

export function isInfra(relPath: string): boolean {
  return INFRA_PATTERNS.some((p) => p.test(relPath));
}

// runtime-integration files (loaders/plugins/registries/...). kept in graph
// but skipped by recommendations (they look like fanIn=0 leaves otherwise).
const INTEGRATION_NAME_RE =
  /(^|\/)([A-Za-z0-9]+)?(?:Loader|Plugin|Registry|Provider|Bootstrap)(?:\.[a-z]+)?(?:\.[jt]sx?|\.vue|\.svelte)$/u;

export function classifyKind(parsed: ParsedFile, relPath: string): ModuleKind {
  if (/(^|\/)(__tests__|tests?|spec|e2e)(\/|\.)/u.test(relPath)) return 'test';
  if (/\.(test|spec)\.[cm]?[jt]sx?$/u.test(relPath)) return 'test';
  if (/\.config\.[cm]?[jt]sx?$/u.test(relPath) || /(^|\/)config(\/|\.)/u.test(relPath)) {
    return 'config';
  }
  if (/(^|\/)(styles?|theme|tokens)\//u.test(relPath) || /\.(css|scss|sass)$/u.test(relPath)) {
    return 'style';
  }
  if (INTEGRATION_NAME_RE.test(relPath)) return 'integration';
  if (parsed.language === 'vue' || parsed.language === 'svelte') return 'component';
  if (parsed.hasDefineStore) return 'store';
  if (/(^|\/)(api|openapi|graphql)(\/|\.)/u.test(relPath)) return 'api';
  if (/(^|\/)(services?|clients?|repositories)(\/|\.)/u.test(relPath)) return 'service';
  if (/(^|\/)(model|state)(\/|\.)/u.test(relPath)) return 'model';
  if (/(^|\/)(schemas?|dto|types)(\/|\.)/u.test(relPath)) return 'schema';
  if (
    /(^|\/)composables\//u.test(relPath) ||
    /(^|\/)use[A-Z][A-Za-z0-9]*\.[jt]sx?$/u.test(relPath)
  ) {
    return 'composable';
  }
  if (parsed.exports.some((n) => /^use[A-Z]/u.test(n))) return 'composable';
  if (/(^|\/)router(\/|\.)/u.test(relPath)) return 'route';
  if (/(^|\/)(utils|lib|helpers)(\/|\.)/u.test(relPath)) return 'util';
  if (/(^|\/)(main|index|entry)\.[jt]sx?$/u.test(relPath)) return 'entry';
  return 'module';
}
