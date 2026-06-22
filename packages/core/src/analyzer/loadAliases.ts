// Loads path aliases from tsconfig (following the `extends` chain) and the
// Vite config. Pulled out of `analyze()` so `incrementalAnalyze()` can reuse
// it - a single-file rescan needs the same resolver as a full analysis,
// otherwise `@/*` resolution breaks midway.

import type { FileSource } from './fileSource';
import type { ProjectRef } from './types';
import { parseTsconfigPaths, parseViteAliases, type PathAlias } from './resolve';

export async function loadAliases(source: FileSource, project: ProjectRef): Promise<PathAlias[]> {
  const visited = new Set<string>();
  const aliases: PathAlias[] = [];

  async function walk(rel: string): Promise<void> {
    const norm = posixNormalize(rel);
    if (visited.has(norm)) return;
    visited.add(norm);
    let content: string;
    try {
      content = await source.read(norm);
    } catch {
      return;
    }
    const direct = parseTsconfigPaths(content);
    for (const a of direct) aliases.push(a);
    const extendsList = parseTsconfigExtends(content);
    const baseDir = posixDirname(norm);
    for (const ext of extendsList) {
      const candidates = ext.startsWith('.')
        ? [posixJoin(baseDir, ext), posixJoin(baseDir, `${ext}.json`)]
        : [ext, `${ext}.json`];
      for (const c of candidates) {
        if (await source.exists(c)) {
          await walk(c);
          break;
        }
      }
    }
  }

  if (project.tsconfigPath) await walk(project.tsconfigPath);

  for (const a of frameworkDefaultAliases(project.detectedFramework)) aliases.push(a);
  for (const a of await workspacePackageAliases(source)) aliases.push(a);

  for (const candidate of [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mts',
    'vite.config.mjs',
  ]) {
    if (await source.exists(candidate)) {
      try {
        const content = await source.read(candidate);
        for (const a of parseViteAliases(content)) aliases.push(a);
      } catch {
        /* unreadable config - ignore */
      }
      break;
    }
  }

  return dedupeAliases(aliases);
}

async function workspacePackageAliases(source: FileSource): Promise<PathAlias[]> {
  let files: string[];
  try {
    files = await source.list();
  } catch {
    return [];
  }
  const out: PathAlias[] = [];
  for (const rel of files) {
    if (!rel.endsWith('package.json') || rel === 'package.json') continue;
    let raw: string;
    try {
      raw = await source.read(rel);
    } catch {
      continue;
    }
    const pkg = parsePackageJson(raw);
    if (!pkg?.name) continue;
    const dir = posixDirname(rel);
    const exported = aliasesFromPackageExports(pkg, dir);
    if (exported.length > 0) {
      out.push(...exported.map((alias) => ({ ...alias, prefix: `${pkg.name}${alias.prefix}` })));
    } else {
      out.push({ prefix: pkg.name, targets: [`${dir}/src`, dir] });
    }
  }
  const rootPkg = await readPackageJson(source, 'package.json');
  if (rootPkg) out.push(...aliasesFromPackageImports(rootPkg, ''));
  return out;
}

interface PackageJsonLite {
  name?: string;
  exports?: unknown;
  imports?: unknown;
}

async function readPackageJson(source: FileSource, rel: string): Promise<PackageJsonLite | null> {
  try {
    return parsePackageJson(await source.read(rel));
  } catch {
    return null;
  }
}

function parsePackageJson(raw: string): PackageJsonLite | null {
  try {
    const json = JSON.parse(raw) as { name?: unknown; exports?: unknown; imports?: unknown };
    return {
      ...(typeof json.name === 'string' && json.name.length > 0 ? { name: json.name } : {}),
      ...(json.exports !== undefined ? { exports: json.exports } : {}),
      ...(json.imports !== undefined ? { imports: json.imports } : {}),
    };
  } catch {
    return null;
  }
}

function aliasesFromPackageExports(pkg: PackageJsonLite, dir: string): PathAlias[] {
  if (pkg.exports === undefined) return [];
  const out: PathAlias[] = [];
  if (typeof pkg.exports === 'string') {
    out.push({ prefix: '', targets: [posixJoin(dir, pkg.exports)], exact: true });
    return out;
  }
  if (!pkg.exports || typeof pkg.exports !== 'object' || Array.isArray(pkg.exports)) return [];
  if (isConditionalExportsObject(pkg.exports)) {
    const targets = pickPackageTargets(pkg.exports);
    const mapped = targets
      .filter((target) => !target.includes('*'))
      .map((target) => posixJoin(dir, target));
    if (mapped.length > 0) out.push({ prefix: '', targets: mapped, exact: true });
    return out;
  }
  for (const [subpath, value] of Object.entries(pkg.exports as Record<string, unknown>)) {
    if (!subpath.startsWith('.')) continue;
    const targets = pickPackageTargets(value);
    if (targets.length === 0) continue;
    const wildcard = wildcardAlias(subpath, targets, dir);
    if (wildcard) {
      out.push(wildcard);
      continue;
    }
    const suffix = subpath === '.' ? '' : subpath.slice(1);
    if (suffix.includes('*')) continue;
    const mapped = targets
      .filter((target) => !target.includes('*'))
      .map((target) => posixJoin(dir, target));
    if (mapped.length === 0) continue;
    out.push({ prefix: suffix, targets: mapped, exact: true });
  }
  return out;
}

function isConditionalExportsObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => ['types', 'import', 'require', 'default'].includes(key));
}

function aliasesFromPackageImports(pkg: PackageJsonLite, dir: string): PathAlias[] {
  if (!pkg.imports || typeof pkg.imports !== 'object' || Array.isArray(pkg.imports)) return [];
  const out: PathAlias[] = [];
  for (const [key, value] of Object.entries(pkg.imports as Record<string, unknown>)) {
    if (!key.startsWith('#')) continue;
    const targets = pickPackageTargets(value);
    const wildcard = wildcardAlias(key, targets, dir);
    if (wildcard) {
      out.push(wildcard);
      continue;
    }
    if (key.includes('*')) continue;
    const mapped = targets
      .filter((target) => !target.includes('*'))
      .map((target) => posixJoin(dir, target));
    if (mapped.length === 0) continue;
    out.push({ prefix: key, targets: mapped, exact: true });
  }
  return out;
}

function wildcardAlias(key: string, targets: readonly string[], dir: string): PathAlias | null {
  if (!key.includes('*')) return null;
  const mapped = targets
    .filter((target) => target.includes('*'))
    .map((target) => posixJoin(dir, beforeStar(stripPackageTargetPrefix(target))));
  if (mapped.length === 0) return null;
  const prefix = beforeStar(key === './*' ? '' : key.startsWith('.') ? key.slice(1) : key);
  if (!prefix) return null;
  return { prefix, targets: mapped };
}

function beforeStar(value: string): string {
  const head = value.slice(0, value.indexOf('*'));
  return head.replace(/\/+$/u, '');
}

function pickPackageTargets(value: unknown): string[] {
  if (typeof value === 'string') return [stripPackageTargetPrefix(value)];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      out.push(...pickPackageTargets(item));
    }
    return dedupeStrings(out);
  }
  if (!value || typeof value !== 'object') return [];
  const conditions = value as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ['types', 'import', 'require', 'default']) {
    out.push(...pickPackageTargets(conditions[key]));
  }
  return dedupeStrings(out);
}

function stripPackageTargetPrefix(target: string): string {
  return target.replace(/^\.\//u, '');
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function frameworkDefaultAliases(framework: ProjectRef['detectedFramework']): PathAlias[] {
  if (framework === 'svelte') {
    return [{ prefix: '$lib', targets: ['src/lib'] }];
  }
  if (framework === 'nuxt') {
    return [
      { prefix: '~', targets: [''] },
      { prefix: '@', targets: [''] },
      { prefix: '~~', targets: [''] },
      { prefix: '@@', targets: [''] },
    ];
  }
  return [];
}

function parseTsconfigExtends(content: string): string[] {
  try {
    const stripped = content.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
    const json = JSON.parse(stripped) as { extends?: string | string[] };
    if (!json.extends) return [];
    return Array.isArray(json.extends) ? json.extends : [json.extends];
  } catch {
    return [];
  }
}

function dedupeAliases(list: PathAlias[]): PathAlias[] {
  const seen = new Set<string>();
  const out: PathAlias[] = [];
  for (const a of list) {
    const key = `${a.prefix}\u0001${a.exact === true ? 'exact' : 'prefix'}\u0001${a.targets.join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((a, b) => b.prefix.length - a.prefix.length || Number(b.exact) - Number(a.exact));
}

function posixNormalize(p: string): string {
  return p.replace(/\\/gu, '/').replace(/\/+/gu, '/');
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function posixJoin(a: string, b: string): string {
  const segments = `${a}/${b}`.split('/');
  const out: string[] = [];
  for (const s of segments) {
    if (s === '' || s === '.') continue;
    if (s === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
      continue;
    }
    out.push(s);
  }
  return out.join('/');
}
