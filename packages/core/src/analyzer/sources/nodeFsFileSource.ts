import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import type { FileSource } from '../fileSource';
import { ALWAYS_SKIP_DIRS, TEST_LIKE_DIRS } from '../discover';

const SUPPORTED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.mjs', '.cjs']);

export interface NodeFsFileSourceOptions {
  rootPath: string;
  respectGitignore?: boolean;
  extraIgnore?: string[];
  /** If true (default) - skip test/storybook/cypress/playwright directories. */
  skipTestLikeDirs?: boolean;
}

async function loadGitignore(rootPath: string): Promise<Ignore> {
  const ig = ignore();
  try {
    const content = await fs.readFile(path.join(rootPath, '.gitignore'), 'utf8');
    ig.add(content);
  } catch {
    /* no gitignore is fine */
  }
  return ig;
}

export async function createNodeFsFileSource(
  options: NodeFsFileSourceOptions,
): Promise<FileSource> {
  const { rootPath, respectGitignore = true, extraIgnore = [], skipTestLikeDirs = true } = options;
  const absRoot = path.resolve(rootPath);
  const ig = respectGitignore ? await loadGitignore(absRoot) : ignore();
  if (extraIgnore.length > 0) ig.add(extraIgnore);

  return {
    rootPath: absRoot,
    async list(): Promise<string[]> {
      const out: string[] = [];
      await walk(absRoot, '', ig, out, skipTestLikeDirs);
      return out.sort();
    },
    async read(rel: string): Promise<string> {
      return fs.readFile(path.join(absRoot, rel), 'utf8');
    },
    async exists(rel: string): Promise<boolean> {
      try {
        const stat = await fs.stat(path.join(absRoot, rel));
        return stat.isFile();
      } catch {
        return false;
      }
    },
  };
}

async function walk(
  absRoot: string,
  relDir: string,
  ig: Ignore,
  out: string[],
  skipTestLikeDirs: boolean,
): Promise<void> {
  const absDir = path.join(absRoot, relDir);
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const relPath = relDir ? path.posix.join(toPosix(relDir), entry.name) : entry.name;

    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
      if (skipTestLikeDirs && TEST_LIKE_DIRS.has(entry.name)) continue;
      if (ig.ignores(`${relPath}/`)) continue;
      await walk(absRoot, relPath, ig, out, skipTestLikeDirs);
      continue;
    }

    if (!entry.isFile()) continue;
    if (ig.ignores(relPath)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXT.has(ext)) continue;
    out.push(relPath);
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
