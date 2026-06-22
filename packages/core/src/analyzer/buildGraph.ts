import type { FileSource } from './fileSource';
import type {
  AnalyzerWarning,
  DependencyEdge,
  FactConfidence,
  ImportResolutionKind,
  ModuleNode,
  ParsedFile,
  ParsedFileSummary,
  RawImport,
  ScanProgressCallback,
} from './types';
import { createParserRegistry, isParseFailure } from './parsers';
import type { Framework } from './detect';
import { applyAlias, type PathAlias, type Resolver } from './resolve';
import { classifyKind, isInfra } from './classify';
import { classifyModuleRuntime, isServerActionsModule } from './rsc';
import type { ArchoraConfig } from '../config/frontScopeConfig';

export interface BuildGraphInput {
  source: FileSource;
  files: string[];
  resolver: Resolver;
  aliases?: PathAlias[];
  config?: ArchoraConfig;
  framework?: Framework;
  onProgress?: ScanProgressCallback;
}

export interface BuildGraphResult {
  modules: ModuleNode[];
  edges: DependencyEdge[];
  parserFacts: ParsedFileSummary[];
  warnings: AnalyzerWarning[];
}

const CHUNK_SIZE = 100;
const MAX_FILE_BYTES = 1_000_000;
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export async function buildGraph(input: BuildGraphInput): Promise<BuildGraphResult> {
  const { source, files, resolver, aliases = [], config, framework, onProgress } = input;
  const registry = createParserRegistry({
    ...(config?.dynamicLoaders ? { dynamicLoaders: config.dynamicLoaders } : {}),
    ...(framework ? { framework } : {}),
  });

  const parsed: ParsedFile[] = [];
  const warnings: AnalyzerWarning[] = [];

  onProgress?.({ phase: 'parse', current: 0, total: files.length });
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (relPath): Promise<ParsedFile | null> => {
        try {
          const content = await source.read(relPath);
          if (content.length > MAX_FILE_BYTES) {
            warnings.push({
              code: 'parse-failed',
              message: `File exceeds ${MAX_FILE_BYTES} bytes, skipped`,
              file: relPath,
            });
            return null;
          }
          const result = registry.parse({ relPath, content });
          if (isParseFailure(result)) {
            warnings.push({
              code: 'unsupported-extension',
              message: 'Unsupported extension',
              file: relPath,
            });
            return null;
          }
          return result;
        } catch (err) {
          warnings.push({
            code: 'parse-failed',
            message: 'Parse failed',
            file: relPath,
            detail: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      }),
    );
    for (const r of results) if (r) parsed.push(r);
    onProgress?.({
      phase: 'parse',
      current: Math.min(i + CHUNK_SIZE, files.length),
      total: files.length,
    });
    await yieldToEventLoop();
  }

  const modules: ModuleNode[] = parsed.map((p) => ({
    id: p.relPath,
    absPath: p.relPath,
    kind: classifyKind(p, p.relPath),
    language: p.language,
    loc: p.loc,
    exports: p.exports,
    isInfra: isInfra(p.relPath),
    runtime: classifyModuleRuntime({
      relPath: p.relPath,
      framework: input.framework ?? 'unknown',
      ...(p.directives ? { directives: p.directives } : {}),
      ...(p.imports.some((i) => i.specifier === 'server-only') ? { importsServerOnly: true } : {}),
      ...(p.imports.some((i) => i.specifier === 'client-only') ? { importsClientOnly: true } : {}),
    }),
    ...(isServerActionsModule(p.directives) ? { isServerActions: true } : {}),
  }));
  const parserFacts = parsed.map((p) => toParsedFileSummary(p, input.framework ?? 'unknown'));

  const moduleIds = new Set(modules.map((m) => m.id));
  const edges: DependencyEdge[] = [];

  const filesByDir = indexFilesByDir(files);

  for (const file of parsed) {
    const negativeGlobPatterns = file.imports
      .filter((imp) => imp.pattern === 'glob' && imp.specifier.startsWith('!'))
      .map((imp) => imp.specifier.slice(1));
    for (const imp of file.imports) {
      if (isAssetSpecifier(imp.specifier)) continue;
      // glob/prefix specifiers may start with a bare name ('src/**') -
      // skip the external check for them
      if (
        imp.pattern !== 'glob' &&
        imp.pattern !== 'prefix' &&
        isExternal(imp.specifier) &&
        resolver.hasLocalCandidate?.(imp.specifier) !== true
      ) {
        continue;
      }

      if (imp.pattern === 'glob') {
        if (imp.specifier.startsWith('!')) continue;
        if (isAssetGlobSpecifier(imp.specifier)) continue;
        const fromDir = posixDirnameLocal(file.relPath);
        const matched = expandGlob(
          imp.specifier,
          fromDir,
          files,
          moduleIds,
          negativeGlobPatterns,
          aliases,
        );
        if (matched.length === 0) {
          warnings.push({
            code: 'resolve-failed',
            message: `import.meta.glob("${imp.specifier}") matched no files`,
            file: file.relPath,
          });
          continue;
        }
        for (const target of matched) {
          if (target === file.relPath) continue;
          edges.push({
            from: file.relPath,
            to: target,
            kind: imp.kind,
            specifier: imp.specifier,
            resolved: true,
            ...edgeMeta(imp, 'glob', 'low', true),
          });
        }
        continue;
      }

      if (imp.pattern === 'prefix') {
        // template-literal dynamic import like `import('./mfes/' + x)`:
        // connect to every file under the static prefix dir
        const baseDir = resolvePrefixDir(imp.specifier, file.relPath);
        if (baseDir === null) {
          warnings.push({
            code: 'resolve-failed',
            message: `Cannot resolve dynamic prefix "${imp.specifier}"`,
            file: file.relPath,
          });
          continue;
        }
        const matched = expandPrefix(baseDir, filesByDir, moduleIds);
        if (matched.length === 0) {
          warnings.push({
            code: 'resolve-failed',
            message: `Dynamic prefix "${imp.specifier}" matched no files`,
            file: file.relPath,
          });
          continue;
        }
        for (const target of matched) {
          if (target === file.relPath) continue;
          edges.push({
            from: file.relPath,
            to: target,
            kind: imp.kind,
            specifier: imp.specifier,
            resolved: true,
            ...edgeMeta(imp, 'prefix', 'medium', true),
          });
        }
        continue;
      }

      const resolved = await resolver.resolve(imp.specifier, file.relPath);
      if (resolved && moduleIds.has(resolved)) {
        if (resolved === file.relPath) {
          warnings.push({
            code: 'self-import',
            message: 'Module imports itself',
            file: file.relPath,
          });
        }
        edges.push({
          from: file.relPath,
          to: resolved,
          kind: imp.kind,
          specifier: imp.specifier,
          resolved: true,
          ...edgeMeta(imp, imp.kind === 'dynamic' ? 'dynamic-literal' : 'literal', 'high', false),
        });
      } else {
        warnings.push({
          code: 'resolve-failed',
          message: `Cannot resolve "${imp.specifier}"`,
          file: file.relPath,
        });
      }
    }
  }

  // unplugin-vue-components: PascalCase template tags -> src/components/**/*.vue
  // (vite) or components/**/*.vue (nuxt). runs after static imports for dedupe
  const componentRegistry = buildComponentRegistry(files, framework);
  const existingEdges = new Set(edges.map((e) => `${e.from}\u0001${e.to}`));
  for (const file of parsed) {
    if (!file.templateRefs || file.templateRefs.length === 0) continue;
    for (const name of file.templateRefs) {
      const target = componentRegistry.get(name);
      if (!target || target === file.relPath) continue;
      const key = `${file.relPath}\u0001${target}`;
      if (existingEdges.has(key)) continue;
      existingEdges.add(key);
      edges.push({
        from: file.relPath,
        to: target,
        kind: 'auto-import',
        specifier: name,
        resolved: true,
        confidence: 'medium',
        resolutionKind: 'framework-auto',
        approximate: true,
      });
    }
  }

  // Nuxt auto-import: composables/** are exposed globally, a consumer calls
  // useFoo() with no import. Resolve the call against a name -> composable file
  // registry. unplugin-auto-import outside Nuxt is config-driven (see docs limitation).
  const composableRegistry = buildComposableRegistry(parsed, framework);
  if (composableRegistry.size > 0) {
    for (const file of parsed) {
      if (!file.callIdentifiers || file.callIdentifiers.length === 0) continue;
      for (const name of file.callIdentifiers) {
        const target = composableRegistry.get(name);
        if (!target || target === file.relPath) continue;
        const key = `${file.relPath}\u0001${target}`;
        if (existingEdges.has(key)) continue;
        existingEdges.add(key);
        edges.push({
          from: file.relPath,
          to: target,
          kind: 'auto-import',
          specifier: name,
          resolved: true,
          confidence: 'medium',
          resolutionKind: 'framework-auto',
          approximate: true,
        });
      }
    }
  }

  return { modules, edges, parserFacts, warnings };
}

function edgeMeta(
  imp: RawImport,
  resolutionKind: ImportResolutionKind,
  confidence: FactConfidence,
  approximate: boolean,
): Pick<DependencyEdge, 'confidence' | 'resolutionKind' | 'approximate'> {
  return {
    confidence: imp.confidence ?? confidence,
    resolutionKind: imp.resolutionKind ?? resolutionKind,
    approximate: imp.approximate ?? approximate,
  };
}

function toParsedFileSummary(file: ParsedFile, framework: string): ParsedFileSummary {
  const imports = file.imports.map((imp) => {
    const asset = isAssetSpecifier(imp.specifier);
    const patternKind =
      imp.pattern === 'glob'
        ? 'glob'
        : imp.pattern === 'prefix'
          ? 'prefix'
          : asset
            ? 'asset'
            : imp.kind === 'dynamic'
              ? 'dynamic-literal'
              : 'literal';
    return {
      specifier: imp.specifier,
      kind: imp.kind,
      resolutionKind: imp.resolutionKind ?? patternKind,
      confidence:
        imp.confidence ??
        (imp.pattern === 'glob' ? 'low' : imp.pattern === 'prefix' ? 'medium' : 'high'),
      approximate: imp.approximate ?? (imp.pattern === 'glob' || imp.pattern === 'prefix'),
      ...(asset ? { isAsset: true } : {}),
      ...(imp.pattern === 'glob' ? { globEager: imp.globEager ?? false } : {}),
      ...(imp.globImport ? { globImport: imp.globImport } : {}),
      ...(imp.pattern === 'glob' && imp.specifier.startsWith('!') ? { negative: true } : {}),
    };
  });
  const assetFacts = file.imports
    .filter((imp) => isAssetSpecifier(imp.specifier))
    .map((imp) => ({
      specifier: imp.specifier,
      assetKind: assetKindOf(imp.specifier),
      confidence: 'high' as const,
    }));
  const runtime = file.directives?.includes('use server')
    ? 'server'
    : file.directives?.includes('use client')
      ? 'client'
      : 'shared';
  const runtimeSource =
    file.directives && file.directives.length > 0
      ? 'directive'
      : /(^|\/)(server|app\/api)\//u.test(file.relPath) || /\+server\.[jt]s$/u.test(file.relPath)
        ? 'framework-convention'
        : 'default';
  return {
    relPath: file.relPath,
    language: file.language,
    loc: file.loc,
    imports,
    exports: file.exports.map((name) => ({ name, kind: exportKindOf(name), confidence: 'medium' })),
    runtimeFacts: [
      {
        runtime,
        source: runtimeSource,
        confidence: runtimeSource === 'default' ? 'low' : 'high',
      },
    ],
    frameworkFacts: [
      ...(file.templateRefs ?? []).map((value) => ({
        kind: 'vue-template-ref' as const,
        value,
        confidence: 'medium' as const,
      })),
      ...frameworkFactsFromPath(file.relPath, framework),
    ],
    routeFacts: routeFactsFromPath(file.relPath, framework),
    stateFacts: file.hasDefineStore
      ? [{ kind: 'pinia-store' as const, confidence: 'high' as const }]
      : [],
    assetFacts,
    limitations: limitationsFor(file),
  };
}

// vite default: src/components/**, nuxt: components/**. first match wins on basename collision.
function buildComponentRegistry(
  files: string[],
  framework: Framework | undefined,
): Map<string, string> {
  const registry = new Map<string, string>();
  const re =
    framework === 'nuxt' ? /^components\/|(^|\/)src\/components\//u : /(^|\/)src\/components\//u;
  for (const f of files) {
    if (!re.test(f)) continue;
    if (!f.toLowerCase().endsWith('.vue')) continue;
    const slash = f.lastIndexOf('/');
    const base = (slash === -1 ? f : f.slice(slash + 1)).slice(0, -'.vue'.length);
    if (base.length === 0) continue;
    if (!registry.has(base)) registry.set(base, f);
  }
  return registry;
}

// Nuxt auto-import: composables/**/*.{ts,js} are exposed globally. Registry name =
// named exports + file basename (for `export default`). First-wins on collision.
// Nuxt only: unplugin-auto-import outside Nuxt is config-driven (see docs limitation).
const NUXT_COMPOSABLE_EXT = /\.[cm]?[jt]s$/u;

// True when one of `rel`'s directory segments equals `segment`. Linear scan, used
// instead of `(^|\/)<dir>\/.+` regexes: paths come from scanned, untrusted repos,
// so a `.+`-based pattern that re-anchors on every `/<dir>/` is a ReDoS risk.
function isUnderDirSegment(rel: string, segment: string): boolean {
  const lastSlash = rel.lastIndexOf('/');
  if (lastSlash < 0) return false;
  return rel.slice(0, lastSlash).split('/').includes(segment);
}

// File under a `composables/` directory with a JS/TS extension (js/ts/mjs/mts/cjs/cts).
export function isNuxtComposablePath(rel: string): boolean {
  return NUXT_COMPOSABLE_EXT.test(rel) && isUnderDirSegment(rel, 'composables');
}

function buildComposableRegistry(
  parsed: ParsedFile[],
  framework: Framework | undefined,
): Map<string, string> {
  const registry = new Map<string, string>();
  if (framework !== 'nuxt') return registry;
  for (const file of parsed) {
    if (!isNuxtComposablePath(file.relPath)) continue;
    const names = new Set<string>();
    for (const exp of file.exports) if (exp !== 'default') names.add(exp);
    const slash = file.relPath.lastIndexOf('/');
    const dot = file.relPath.lastIndexOf('.');
    const base = file.relPath.slice(slash + 1, dot);
    if (base.length > 0) names.add(base);
    for (const name of names) if (!registry.has(name)) registry.set(name, file.relPath);
  }
  return registry;
}

function indexFilesByDir(files: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    const dir = posixDirname(f);
    let bucket = map.get(dir);
    if (!bucket) {
      bucket = [];
      map.set(dir, bucket);
    }
    bucket.push(f);
  }
  return map;
}

// returns null if the prefix would expand to project root or outside the tree
function resolvePrefixDir(prefix: string, fromRel: string): string | null {
  if (prefix.startsWith('/')) return null;
  const trailingSlash = prefix.endsWith('/');
  const fromDir = posixDirname(fromRel);
  const isRelative = prefix.startsWith('./') || prefix.startsWith('../');
  const joined = isRelative ? posixJoin(fromDir, prefix) : prefix;
  const base = trailingSlash
    ? joined
    : (() => {
        const idx = joined.lastIndexOf('/');
        return idx === -1 ? '' : joined.slice(0, idx);
      })();
  if (base === '' || !base.includes('/')) return null;
  return base;
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']);

function globToRegex(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      const next = glob[i + 1];
      if (next === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (/[.+^$(){}|\\[\]]/u.test(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function expandGlob(
  pattern: string,
  fromDir: string,
  files: string[],
  moduleIds: Set<string>,
  negativePatterns: readonly string[] = [],
  aliases: readonly PathAlias[] = [],
): string[] {
  const patterns = expandAliasedGlobPattern(pattern, fromDir, aliases);
  const res = patterns.map(globToRegex);
  const negativeRes = negativePatterns
    .flatMap((p) => expandAliasedGlobPattern(p, fromDir, aliases))
    .map(globToRegex);
  const out: string[] = [];
  for (const f of files) {
    if (!moduleIds.has(f)) continue;
    if (res.some((re) => re.test(f))) out.push(f);
  }
  return negativeRes.length === 0 ? out : out.filter((f) => !negativeRes.some((re) => re.test(f)));
}

function expandAliasedGlobPattern(
  pattern: string,
  fromDir: string,
  aliases: readonly PathAlias[],
): string[] {
  const anchored = anchorGlobPattern(pattern, fromDir);
  const aliased = applyAlias(anchored, [...aliases]);
  return aliased.length > 0 ? aliased : [anchored];
}

function anchorGlobPattern(pattern: string, fromDir: string): string {
  // vite globs are relative to the file -- anchor to project root
  if (pattern.startsWith('/')) return pattern.slice(1);
  if (pattern.startsWith('./') || pattern.startsWith('../')) return posixJoin(fromDir, pattern);
  return pattern;
}

function posixDirnameLocal(p: string): string {
  return posixDirname(p);
}

function expandPrefix(
  baseDir: string,
  filesByDir: Map<string, string[]>,
  moduleIds: Set<string>,
): string[] {
  const out: string[] = [];
  const prefix = baseDir === '' ? '' : `${baseDir}/`;
  for (const [dir, bucket] of filesByDir) {
    if (dir !== baseDir && !dir.startsWith(prefix)) continue;
    for (const f of bucket) {
      const ext = f.slice(f.lastIndexOf('.')).toLowerCase();
      if (!SOURCE_EXTS.has(ext)) continue;
      if (!moduleIds.has(f)) continue;
      out.push(f);
    }
  }
  return out;
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function posixJoin(a: string, b: string): string {
  const segments = `${a}/${b}`.split('/');
  const stack: string[] = [];
  for (const s of segments) {
    if (s === '' || s === '.') continue;
    if (s === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else stack.push('..');
      continue;
    }
    stack.push(s);
  }
  return stack.join('/');
}

function isExternal(spec: string): boolean {
  if (spec.startsWith('.') || spec.startsWith('/')) return false;
  if (spec.startsWith('@/') || spec.startsWith('~/')) return false;
  return /^[a-z@]/u.test(spec) && !spec.includes('://');
}

const ASSET_EXTS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.module.css',
  '.module.scss',
  '.json',
  '.html',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);

function isAssetGlobSpecifier(specifier: string): boolean {
  return ASSET_EXTS.has(extensionFromPattern(specifier));
}

function extensionFromPattern(specifier: string): string {
  const clean = (specifier.split('?')[0] ?? specifier).toLowerCase();
  const match = clean.match(/\.([a-z0-9]+)(?:$|[!*,{}[\]/])/u);
  return match ? `.${match[1]}` : '';
}

function isAssetSpecifier(specifier: string): boolean {
  const clean = specifier.split('?')[0] ?? specifier;
  const lower = clean.toLowerCase();
  for (const ext of ASSET_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function assetKindOf(specifier: string): 'style' | 'json' | 'image' | 'font' | 'other' {
  const clean = (specifier.split('?')[0] ?? specifier).toLowerCase();
  if (/\.(css|scss|sass|less)$/u.test(clean)) return 'style';
  if (clean.endsWith('.json')) return 'json';
  if (/\.(svg|png|jpg|jpeg|gif|webp|avif|ico)$/u.test(clean)) return 'image';
  if (/\.(woff2?|ttf|otf)$/u.test(clean)) return 'font';
  return 'other';
}

function exportKindOf(name: string): 'value' | 'type' | 'default' | 'namespace' | 'named' {
  if (name === 'default') return 'default';
  if (name === '*') return 'namespace';
  return 'named';
}

function frameworkFactsFromPath(
  relPath: string,
  framework: string,
): {
  kind:
    | 'react-lazy'
    | 'next-dynamic'
    | 'nuxt-auto-component'
    | 'nuxt-auto-composable'
    | 'sveltekit-route';
  value: string;
  confidence: FactConfidence;
}[] {
  const facts: {
    kind:
      | 'react-lazy'
      | 'next-dynamic'
      | 'nuxt-auto-component'
      | 'nuxt-auto-composable'
      | 'sveltekit-route';
    value: string;
    confidence: FactConfidence;
  }[] = [];
  if (
    framework === 'svelte' &&
    /(^|\/)\+(page|layout|server)\.svelte$|(^|\/)\+server\.[jt]s$/u.test(relPath)
  ) {
    facts.push({ kind: 'sveltekit-route', value: relPath, confidence: 'medium' });
  }
  if (
    framework === 'nuxt' &&
    relPath.endsWith('.vue') &&
    isUnderDirSegment(relPath, 'components')
  ) {
    facts.push({ kind: 'nuxt-auto-component', value: relPath, confidence: 'medium' });
  }
  if (framework === 'nuxt' && isNuxtComposablePath(relPath)) {
    facts.push({ kind: 'nuxt-auto-composable', value: relPath, confidence: 'medium' });
  }
  return facts;
}

function routeFactsFromPath(
  relPath: string,
  framework: string,
): {
  routeKind: 'page' | 'layout' | 'api' | 'middleware' | 'server-route';
  confidence: FactConfidence;
}[] {
  const facts: {
    routeKind: 'page' | 'layout' | 'api' | 'middleware' | 'server-route';
    confidence: FactConfidence;
  }[] = [];
  if (framework === 'next') {
    if (/(^|\/)app(?:\/.*)?\/page\.[jt]sx?$/u.test(relPath))
      facts.push({ routeKind: 'page', confidence: 'medium' });
    if (/(^|\/)app(?:\/.*)?\/layout\.[jt]sx?$/u.test(relPath))
      facts.push({ routeKind: 'layout', confidence: 'medium' });
    if (/(^|\/)app\/api\/.*\/route\.[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'api', confidence: 'medium' });
    if (/(^|\/)pages\/api\/.*\.[jt]sx?$/u.test(relPath))
      facts.push({ routeKind: 'api', confidence: 'medium' });
    if (/(^|\/)pages\/(?!api\/).*\.[jt]sx?$/u.test(relPath))
      facts.push({ routeKind: 'page', confidence: 'medium' });
    if (/(^|\/)middleware\.[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'middleware', confidence: 'medium' });
  }
  if (framework === 'nuxt') {
    if (/(^|\/)pages\/.*\.vue$/u.test(relPath))
      facts.push({ routeKind: 'page', confidence: 'medium' });
    if (/(^|\/)layouts\/.*\.vue$/u.test(relPath))
      facts.push({ routeKind: 'layout', confidence: 'medium' });
    if (/(^|\/)server\/api\/.*\.[cm]?[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'api', confidence: 'medium' });
    if (/(^|\/)middleware\/.*\.[cm]?[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'middleware', confidence: 'medium' });
  }
  if (framework === 'svelte') {
    if (/(^|\/)\+page\.svelte$/u.test(relPath))
      facts.push({ routeKind: 'page', confidence: 'medium' });
    if (/(^|\/)\+page\.[cm]?[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'page', confidence: 'medium' });
    if (/(^|\/)\+layout\.svelte$/u.test(relPath))
      facts.push({ routeKind: 'layout', confidence: 'medium' });
    if (/(^|\/)\+layout\.[cm]?[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'layout', confidence: 'medium' });
    if (/(^|\/)\+page\.server\.[cm]?[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'server-route', confidence: 'medium' });
    if (/(^|\/)\+server\.[jt]s$/u.test(relPath))
      facts.push({ routeKind: 'server-route', confidence: 'medium' });
  }
  if (framework === 'react') {
    if (/(^|\/)src\/routes\/__root\.[jt]sx?$/u.test(relPath))
      facts.push({ routeKind: 'layout', confidence: 'low' });
    if (/(^|\/)src\/routes\/(?!__root\.)[^/]+\.[jt]sx?$/u.test(relPath))
      facts.push({ routeKind: 'page', confidence: 'low' });
  }
  return facts;
}

function limitationsFor(file: ParsedFile): string[] {
  const out: string[] = [];
  if (file.imports.some((imp) => imp.pattern === 'glob')) {
    out.push(
      'import.meta.glob edges are expanded statically and marked low-confidence approximate',
    );
  }
  if (file.imports.some((imp) => imp.pattern === 'prefix')) {
    out.push('dynamic import prefix edges are approximate');
  }
  if (file.exports.length > 0) {
    out.push('export facts are name-only; type/value provenance is not fully resolved yet');
  }
  return out;
}
