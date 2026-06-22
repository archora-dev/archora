// Resolve the inputs needed to compute a project-specific cache key from
// disk: tsconfig text, package.json deps, archora config text. Used by
// `analyze`, `cache clear` and `watch` so they all hit the same cache entry.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CacheKeyInputs } from '@archora/core/cache';

const TSCONFIG_CANDIDATES = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.base.json'];
const FRONTSCOPE_CONFIG_CANDIDATES = ['.archora.json', 'archora.config.json'];

const TOOL_VERSION = (() => {
  try {
    // process.env override lets benchmarks pin a stable version across runs.
    return process.env['FRONTSCOPE_VERSION'] ?? readPackageVersion() ?? '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
})();

function readPackageVersion(): string | null {
  // Best-effort: locate the cli package.json relative to this module.
  // vite-node sets `import.meta.url`, but resolving it portably is more
  // trouble than it's worth - the env override is the canonical knob.
  return null;
}

export function getToolVersion(): string {
  return TOOL_VERSION;
}

export async function loadCacheInputs(rootPath: string): Promise<CacheKeyInputs> {
  const [tsconfigText, packageDeps, frontScopeConfigText] = await Promise.all([
    firstReadable(rootPath, TSCONFIG_CANDIDATES),
    readPackageDeps(rootPath),
    firstReadable(rootPath, FRONTSCOPE_CONFIG_CANDIDATES),
  ]);
  return {
    rootPath,
    toolVersion: TOOL_VERSION,
    ...(tsconfigText !== null ? { tsconfigText } : {}),
    ...(packageDeps !== null ? { packageDeps } : {}),
    ...(frontScopeConfigText !== null ? { frontScopeConfigText } : {}),
  };
}

async function firstReadable(root: string, names: string[]): Promise<string | null> {
  for (const n of names) {
    try {
      return await fs.readFile(path.join(root, n), 'utf8');
    } catch {
      /* keep looking */
    }
  }
  return null;
}

async function readPackageDeps(root: string): Promise<string | null> {
  try {
    const text = await fs.readFile(path.join(root, 'package.json'), 'utf8');
    const pkg = JSON.parse(text) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return JSON.stringify({
      d: sortedEntries(pkg.dependencies),
      dd: sortedEntries(pkg.devDependencies),
      pd: sortedEntries(pkg.peerDependencies),
    });
  } catch {
    return null;
  }
}

function sortedEntries(obj: Record<string, string> | undefined): [string, string][] {
  if (!obj) return [];
  return Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
