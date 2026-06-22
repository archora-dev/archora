import type { FileSource } from './fileSource';

export interface DiscoverOptions {
  excludeTests?: boolean;
  excludeStories?: boolean;
  excludeDeclarations?: boolean;
  excludeConfigs?: boolean;
  /** Glob patterns to skip (`.archora.json#ignore`). Supports `**`/`*`/`?`. */
  extraIgnoreGlobs?: string[];
}

export interface DiscoverResult {
  files: string[];
  byExt: Record<string, number>;
  skipped: number;
}

const DEFAULTS: Required<DiscoverOptions> = {
  excludeTests: true,
  excludeStories: true,
  excludeDeclarations: true,
  excludeConfigs: true,
  extraIgnoreGlobs: [],
};

const TEST_RE = /(^|\/)__(tests|mocks|snapshots)__\/|\.(test|spec)\.[cm]?[jt]sx?$/u;
const STORIES_RE = /\.stories\.([cm]?[jt]sx?|vue)$/u;
const DTS_RE = /\.d\.[cm]?ts$/u;
const CONFIG_RE =
  /(^|\/)(vite|vitest|rollup|webpack|esbuild|jest|cypress|playwright|tailwind|postcss|svgo|babel|eslint|prettier|stylelint|tsup|rolldown|nuxt|astro)\.config\.[cm]?[jt]sx?$/u;
const TEST_DIR_RE = /(^|\/)(cypress|playwright|e2e|\.storybook)\//u;

export const ALWAYS_SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.cache',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
  '.svelte-kit',
  '.output',
  '.idea',
  '.vscode',
]);

export const TEST_LIKE_DIRS: ReadonlySet<string> = new Set([
  '__tests__',
  '__mocks__',
  '__snapshots__',
  'cypress',
  'playwright',
  '.storybook',
]);

export async function discoverFiles(
  source: FileSource,
  options: DiscoverOptions = {},
): Promise<DiscoverResult> {
  const opts = { ...DEFAULTS, ...options };
  const extraRegexes = opts.extraIgnoreGlobs.map(globToRegex);
  const all = await source.list();
  const files: string[] = [];
  const byExt: Record<string, number> = {};
  let skipped = 0;

  for (const f of all) {
    if (shouldSkip(f, opts, extraRegexes)) {
      skipped++;
      continue;
    }
    files.push(f);
    const ext = extOf(f);
    byExt[ext] = (byExt[ext] ?? 0) + 1;
  }

  return { files, byExt, skipped };
}

function shouldSkip(rel: string, opts: Required<DiscoverOptions>, extra: RegExp[]): boolean {
  if (opts.excludeDeclarations && DTS_RE.test(rel)) return true;
  if (opts.excludeTests && (TEST_RE.test(rel) || TEST_DIR_RE.test(rel))) return true;
  if (opts.excludeStories && STORIES_RE.test(rel)) return true;
  if (opts.excludeConfigs && CONFIG_RE.test(rel)) return true;
  if (extra.length > 0) {
    const norm = rel.replace(/^\.\//u, '');
    for (const re of extra) if (re.test(norm)) return true;
  }
  return false;
}

export function compileGlob(glob: string): RegExp {
  return globToRegex(glob);
}

function globToRegex(glob: string): RegExp {
  const trimmed = glob.replace(/^\.\//u, '');
  let re = '';
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i]!;
    if (c === '*') {
      const next = trimmed[i + 1];
      if (next === '*') {
        if (trimmed[i + 2] === '/') {
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

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i === -1 ? '' : p.slice(i).toLowerCase();
}
