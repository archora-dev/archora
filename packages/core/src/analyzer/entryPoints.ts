import type { FileSource } from './fileSource';
import type { ModuleId } from './types';
import type { Framework } from './detect';

// entry-point sources, in priority order:
//   1. .archora.json -> entryPoints
//   2. index.html <script type="module" src=...>
//   3. framework conventions (nuxt pages, next app/pages, sveltekit routes)
//   4. fallback heuristic: src/main.* or src/index.*
export interface DiscoverEntryPointsInput {
  source: FileSource;
  moduleIds: Iterable<ModuleId>;
  configEntryPoints?: string[];
  framework?: Framework;
}

export async function discoverEntryPoints(input: DiscoverEntryPointsInput): Promise<ModuleId[]> {
  const set = new Set<ModuleId>();
  const moduleSet = new Set(input.moduleIds);

  if (input.configEntryPoints && input.configEntryPoints.length > 0) {
    for (const p of input.configEntryPoints) {
      for (const m of matchPath(p, moduleSet)) set.add(m);
    }
  }

  for (const candidate of ['index.html', 'public/index.html']) {
    if (await input.source.exists(candidate)) {
      let html: string;
      try {
        html = await input.source.read(candidate);
      } catch {
        continue;
      }
      for (const src of parseModuleScriptSrcs(html)) {
        const norm = src.replace(/^\.?\//u, '');
        if (moduleSet.has(norm)) set.add(norm);
      }
    }
  }

  for (const re of frameworkEntryPatterns(input.framework)) {
    for (const id of moduleSet) if (re.test(id)) set.add(id);
  }

  if (set.size > 0) return [...set];

  const patterns = [
    /(^|\/)src\/main\.[jt]sx?$/u,
    /(^|\/)src\/index\.[jt]sx?$/u,
    /^main\.[jt]sx?$/u,
    /^index\.[jt]sx?$/u,
  ];
  for (const re of patterns) {
    for (const id of moduleSet) if (re.test(id)) set.add(id);
  }
  return [...set];
}

// framework-convention entries: file-system routing/layouts that aren't statically imported
function frameworkEntryPatterns(framework: Framework | undefined): RegExp[] {
  switch (framework) {
    case 'nuxt':
      return [/^app\.vue$/u, /^error\.vue$/u, /^pages\/.+\.vue$/u, /^layouts\/.+\.vue$/u];
    case 'next':
      return [
        /^pages\/.+\.[jt]sx?$/u,
        /^src\/pages\/.+\.[jt]sx?$/u,
        /^app\/.+\/(page|layout|loading|error|not-found|template)\.[jt]sx?$/u,
        /^app\/(page|layout|loading|error|not-found|template)\.[jt]sx?$/u,
        /^src\/app\/.+\/(page|layout|loading|error|not-found|template)\.[jt]sx?$/u,
        /^src\/app\/(page|layout|loading|error|not-found|template)\.[jt]sx?$/u,
      ];
    case 'svelte':
      // sveltekit only - plain svelte SPAs hit the fallback below
      return [
        /(^|\/)src\/routes\/.*\+page\.svelte$/u,
        /(^|\/)src\/routes\/.*\+layout\.svelte$/u,
        /(^|\/)src\/routes\/.*\+page\.[jt]s$/u,
        /(^|\/)src\/routes\/.*\+layout\.[jt]s$/u,
        /(^|\/)src\/routes\/.*\+server\.[jt]s$/u,
      ];
    default:
      return [];
  }
}

function parseModuleScriptSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*\stype\s*=\s*['"]module['"][^>]*>/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = tag.match(/\ssrc\s*=\s*['"]([^'"]+)['"]/iu);
    if (srcMatch?.[1]) out.push(srcMatch[1]);
  }
  return out;
}

function matchPath(pattern: string, moduleSet: Set<ModuleId>): ModuleId[] {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return moduleSet.has(pattern) ? [pattern] : [];
  }
  const re = simpleGlobToRegex(pattern);
  const out: ModuleId[] = [];
  for (const m of moduleSet) if (re.test(m)) out.push(m);
  return out;
}

function simpleGlobToRegex(glob: string): RegExp {
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
