import ts from 'typescript';
import type { FileSource } from './fileSource';

const EXTS_ORDERED = ['.ts', '.tsx', '.vue', '.svelte', '.js', '.jsx', '.mjs', '.cjs'] as const;
const INDEX_BASES = [
  'index.ts',
  'index.tsx',
  'index.vue',
  'index.svelte',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
] as const;

export interface PathAlias {
  prefix: string;
  targets: string[];
  exact?: boolean;
}

export interface ResolverConfig {
  aliases: PathAlias[];
}

// recognises object/array alias forms. only static expressions are kept
// (path.resolve/join + fileURLToPath(new URL(...))); we never eval config.
export function parseViteAliases(content: string): PathAlias[] {
  const sf = ts.createSourceFile('vite.config.ts', content, ts.ScriptTarget.Latest, true);
  const out: PathAlias[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      isNameEq(node.name, 'alias') &&
      (ts.isObjectLiteralExpression(node.initializer) ||
        ts.isArrayLiteralExpression(node.initializer))
    ) {
      collectAliasInit(node.initializer, out);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return dedupeAliases(out);
}

function collectAliasInit(init: ts.Expression, out: PathAlias[]): void {
  if (ts.isObjectLiteralExpression(init)) {
    for (const prop of init.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = aliasKeyOf(prop.name);
      if (key === null) continue;
      const target = staticPathOf(prop.initializer);
      if (target === null) continue;
      out.push({ prefix: trimSuffix(trimSuffix(key, '/*'), '/'), targets: [target] });
    }
    return;
  }
  if (ts.isArrayLiteralExpression(init)) {
    for (const el of init.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      let find: string | null = null;
      let replacement: string | null = null;
      for (const prop of el.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (isNameEq(prop.name, 'find')) {
          if (ts.isStringLiteralLike(prop.initializer)) find = prop.initializer.text;
        } else if (isNameEq(prop.name, 'replacement')) {
          replacement = staticPathOf(prop.initializer);
        }
      }
      if (find !== null && replacement !== null) {
        out.push({ prefix: trimSuffix(trimSuffix(find, '/*'), '/'), targets: [replacement] });
      }
    }
  }
}

function aliasKeyOf(name: ts.PropertyName): string | null {
  if (ts.isStringLiteralLike(name)) return name.text;
  if (ts.isIdentifier(name)) return name.text;
  return null;
}

function isNameEq(name: ts.PropertyName, value: string): boolean {
  if (ts.isIdentifier(name)) return name.text === value;
  if (ts.isStringLiteralLike(name)) return name.text === value;
  return false;
}

function staticPathOf(node: ts.Expression): string | null {
  if (ts.isStringLiteralLike(node)) {
    return node.text.replace(/\/+$/u, '');
  }
  // path.resolve(__dirname, 'x', 'y') / path.join(...)
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const obj = callee.expression;
      const method = callee.name.text;
      const isPath = ts.isIdentifier(obj) && obj.text === 'path';
      if (isPath && (method === 'resolve' || method === 'join')) {
        return joinStaticArgs(node.arguments);
      }
      // fileURLToPath(new URL('./src', import.meta.url))
      if (
        ts.isIdentifier(callee.expression) &&
        callee.name.text === 'fileURLToPath' &&
        node.arguments.length === 1 &&
        ts.isNewExpression(node.arguments[0]!) &&
        node.arguments[0]!.arguments &&
        ts.isStringLiteralLike(node.arguments[0]!.arguments[0]!)
      ) {
        const tail = (node.arguments[0]!.arguments[0]! as ts.StringLiteralLike).text;
        return trimSuffix(tail.replace(/^\.\//u, ''), '/');
      }
    }
    if (ts.isIdentifier(callee) && callee.text === 'fileURLToPath') {
      const arg = node.arguments[0];
      if (
        arg &&
        ts.isNewExpression(arg) &&
        arg.arguments &&
        arg.arguments[0] &&
        ts.isStringLiteralLike(arg.arguments[0])
      ) {
        const tail = arg.arguments[0].text;
        return trimSuffix(tail.replace(/^\.\//u, ''), '/');
      }
    }
  }
  return null;
}

function joinStaticArgs(args: ts.NodeArray<ts.Expression>): string | null {
  // first arg may be __dirname / process.cwd() - skip it; rest must be literals
  // FIXME: this misses cases where the cwd-ish first arg is itself a const,
  // e.g. `const ROOT = __dirname; path.join(ROOT, 'foo')`. fine for now.
  const parts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (i === 0) {
      if (
        ts.isIdentifier(a) ||
        (ts.isCallExpression(a) &&
          ts.isPropertyAccessExpression(a.expression) &&
          a.expression.name.text === 'cwd')
      ) {
        continue;
      }
      if (ts.isStringLiteralLike(a)) {
        parts.push(a.text);
        continue;
      }
      return null;
    }
    if (!ts.isStringLiteralLike(a)) return null;
    parts.push(a.text);
  }
  return parts.join('/').replace(/\/+/gu, '/').replace(/\/+$/u, '');
}

function dedupeAliases(list: PathAlias[]): PathAlias[] {
  const seen = new Set<string>();
  const out: PathAlias[] = [];
  for (const a of list) {
    const key = `${a.prefix}\u0001${a.targets.join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((a, b) => b.prefix.length - a.prefix.length);
}

export function parseTsconfigPaths(content: string): PathAlias[] {
  const parsed = ts.parseConfigFileTextToJson('tsconfig.json', content);
  if (parsed.error || !parsed.config) return [];
  const config = parsed.config as {
    compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
  };
  const opts = config.compilerOptions;
  if (!opts?.paths) return [];

  const baseUrl = (opts.baseUrl ?? '.').replace(/\/+$/u, '');
  const aliases: PathAlias[] = [];
  for (const [key, list] of Object.entries(opts.paths)) {
    if (key.endsWith('/*')) {
      // `@x/*`: prefix-strip + suffix-append. Targets keep an interior `*`
      // (e.g. `packages/*/src`) so the captured suffix is substituted at the
      // star instead of being appended to a directory that does not exist.
      const prefix = trimSuffix(key, '/*');
      const targets = list.map((t) =>
        t.includes('*') ? joinPosixKeepStar(baseUrl, trimSuffix(t, '/*')) : joinPosix(baseUrl, t),
      );
      aliases.push({ prefix, targets });
      continue;
    }
    // exact tsconfig path (no wildcard): `vue` -> `packages/vue/src`.
    const targets = list.map((t) => joinPosix(baseUrl, t));
    aliases.push({ prefix: key, targets, exact: true });
  }
  aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  return aliases;
}

export interface Resolver {
  resolve(specifier: string, fromRel: string): Promise<string | null>;
  hasLocalCandidate?(specifier: string): boolean;
}

export function createResolver(source: FileSource, config: ResolverConfig): Resolver {
  const cache = new Map<string, string | null>();
  // Resolve an alias whose target is itself an alias (alias→alias chain).
  // `visited` guards against cyclic aliases (@x→@y→@x).
  const resolveAliased = async (spec: string, visited: Set<string>): Promise<string | null> => {
    if (visited.has(spec)) return null;
    visited.add(spec);
    const aliased = applyAlias(spec, config.aliases);
    if (aliased.length === 0) return null;
    for (const candidate of aliased) {
      const found = await tryFile(source, candidate);
      if (found) return found;
    }
    for (const candidate of aliased) {
      if (isBare(candidate) && hasAliasCandidate(candidate, config.aliases)) {
        const chained = await resolveAliased(candidate, visited);
        if (chained) return chained;
      }
    }
    return null;
  };
  return {
    hasLocalCandidate(specifier): boolean {
      return hasAliasCandidate(specifier, config.aliases);
    },
    async resolve(specifier, fromRel): Promise<string | null> {
      const cacheKey = `${fromRel}\u0001${specifier}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
      if (isBare(specifier)) {
        const found = await resolveAliased(specifier, new Set());
        cache.set(cacheKey, found);
        return found;
      }

      const fromDir = posixDirname(fromRel);
      const target = joinPosix(fromDir, specifier);
      const resolved = await tryFile(source, target);
      cache.set(cacheKey, resolved);
      return resolved;
    },
  };
}

function hasAliasCandidate(spec: string, aliases: PathAlias[]): boolean {
  for (const alias of aliases) {
    if (alias.exact) {
      if (spec === alias.prefix) return true;
      if (spec.startsWith(`${alias.prefix}/`)) return true;
      continue;
    }
    const isWildcard = alias.prefix.length > 0;
    if (isWildcard && (spec === alias.prefix || spec.startsWith(`${alias.prefix}/`))) return true;
    if (alias.prefix === '' && !isWildcard) return true;
  }
  return false;
}

export function applyAlias(spec: string, aliases: PathAlias[]): string[] {
  for (const alias of aliases) {
    if (alias.exact) {
      if (spec === alias.prefix) return alias.targets;
      continue;
    }
    const isWildcard = alias.prefix.length > 0;
    if (isWildcard && (spec === alias.prefix || spec.startsWith(`${alias.prefix}/`))) {
      const suffix = spec.slice(alias.prefix.length).replace(/^\//u, '');
      return alias.targets.map((t) =>
        t.includes('*')
          ? normalizePosix(t.replace('*', suffix))
          : suffix
            ? joinPosix(t, suffix)
            : t,
      );
    }
    if (alias.prefix === '' && !isWildcard) {
      return alias.targets.map((t) => joinPosix(t, spec));
    }
  }
  return [];
}

async function tryFile(source: FileSource, candidate: string): Promise<string | null> {
  const norm = normalizePosix(candidate);
  if (await source.exists(norm)) return norm;
  for (const ext of EXTS_ORDERED) {
    const p = `${norm}${ext}`;
    if (await source.exists(p)) return p;
  }
  for (const idx of INDEX_BASES) {
    const p = joinPosix(norm, idx);
    if (await source.exists(p)) return p;
  }
  return null;
}

function isBare(spec: string): boolean {
  // `.` and `..` are folder-imports of the current/parent dir respectively;
  // not bare specifiers. resolver should follow them like `./` / `../`.
  if (spec === '.' || spec === '..') return false;
  return !spec.startsWith('./') && !spec.startsWith('../') && !spec.startsWith('/');
}

function trimSuffix(s: string, suffix: string): string {
  return s.endsWith(suffix) ? s.slice(0, -suffix.length) : s;
}

function joinPosix(...parts: string[]): string {
  const filtered = parts.filter((p) => p && p !== '.');
  return normalizePosix(filtered.join('/'));
}

// Like joinPosix but preserves an interior `*` segment (tsconfig `paths`
// substitution target such as `packages/*/src`). normalizePosix would drop
// nothing for `*`, but the `*` must survive joining with baseUrl untouched.
function joinPosixKeepStar(base: string, target: string): string {
  if (!base || base === '.') return target;
  return `${base}/${target}`.replace(/\/+/gu, '/');
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function normalizePosix(p: string): string {
  const segments = p.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}
