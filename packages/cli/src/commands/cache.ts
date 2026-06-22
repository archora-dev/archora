// `archora cache <subcommand>` - manage the persistent analyzer cache.
//
// Subcommands:
//   clear  Remove the cache directory for the current project.
//   info   Print location, key, size and entry list (diagnostic).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  cacheRootSize,
  clearProjectCache,
  loadCache,
  resolveCacheLocation,
  type CacheLocation,
} from '@archora/core/cache';
import { flagBool, type ParsedArgv } from '../argv';
import { loadCacheInputs } from '../lib/cacheInputs';
import { resolveProjectPath } from './analyze';

export async function runCache(parsed: ParsedArgv): Promise<number> {
  const sub = parsed.positional[0];
  if (!sub) {
    process.stderr.write('error: missing subcommand. Try `archora cache clear` or `cache info`.\n');
    return 2;
  }
  // Drop the subcommand from positional so resolveProjectPath() picks the
  // (optional) project path from positional[1] instead.
  const subParsed: ParsedArgv = {
    command: parsed.command,
    positional: parsed.positional.slice(1),
    flags: parsed.flags,
  };

  switch (sub) {
    case 'clear':
      return runClear(subParsed);
    case 'info':
      return runInfo(subParsed);
    default:
      process.stderr.write(`error: unknown cache subcommand "${sub}".\n`);
      return 2;
  }
}

async function runClear(parsed: ParsedArgv): Promise<number> {
  const projectPath = resolveProjectPath(parsed);
  const inputs = await loadCacheInputs(projectPath);
  const location = await resolveCacheLocation(inputs);
  const all = flagBool(parsed, 'all');

  if (all) {
    // Wipe the whole cache root, not just this project's entry.
    await fs.rm(location.root, { recursive: true, force: true });
    process.stderr.write(`Cleared cache root ${location.root}\n`);
    return 0;
  }
  await clearProjectCache(location);
  process.stderr.write(`Cleared cache for ${projectPath} (${location.root})\n`);
  return 0;
}

async function runInfo(parsed: ParsedArgv): Promise<number> {
  const projectPath = resolveProjectPath(parsed);
  const inputs = await loadCacheInputs(projectPath);
  const location = await resolveCacheLocation(inputs);
  const entry = await loadCache(location);

  const lines: string[] = [];
  lines.push(`project:    ${projectPath}`);
  lines.push(`cache key:  ${location.cacheKey}`);
  lines.push(`cache dir:  ${location.dir}`);
  lines.push(`cache root: ${location.root}`);
  if (entry) {
    lines.push(`entry:      present`);
    lines.push(`created:    ${entry.meta.createdAt}`);
    lines.push(`tool:       ${entry.meta.toolVersion}`);
    lines.push(`modules:    ${entry.scan.modules.length}`);
    lines.push(`files:      ${Object.keys(entry.manifest.files).length}`);
  } else {
    lines.push(`entry:      missing`);
  }
  const stats = await safeRootSize(location);
  lines.push(`root size:  ${stats.files} files, ${formatBytes(stats.bytes)}`);
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

async function safeRootSize(location: CacheLocation): Promise<{ files: number; bytes: number }> {
  try {
    return await cacheRootSize(location.root);
  } catch {
    return { files: 0, bytes: 0 };
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Re-exported for tests / scripts that need to compute the cache dir without
// running the CLI proper.
export async function debugLocate(rootPath: string): Promise<CacheLocation> {
  const inputs = await loadCacheInputs(path.resolve(rootPath));
  return resolveCacheLocation(inputs);
}
