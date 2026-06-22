import ignore, { type Ignore } from 'ignore';
import type { FileSource } from '../fileSource';
import { ALWAYS_SKIP_DIRS, TEST_LIKE_DIRS } from '../discover';

const SUPPORTED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.mjs', '.cjs']);

export interface BrowserFsAccessFileSourceOptions {
  rootHandle: FileSystemDirectoryHandle;
  rootName?: string;
  onProgress?: (visited: number) => void;
  /** If true (default) - skip test/storybook/cypress/playwright directories. */
  skipTestLikeDirs?: boolean;
  /** Read `.gitignore` from root and filter the listing. Default: true. */
  respectGitignore?: boolean;
}

async function loadRootGitignore(root: FileSystemDirectoryHandle): Promise<Ignore> {
  const ig = ignore();
  try {
    const handle = await root.getFileHandle('.gitignore');
    ig.add(await (await handle.getFile()).text());
  } catch {
    // No .gitignore at root.
  }
  return ig;
}

export async function createBrowserFsAccessFileSource(
  options: BrowserFsAccessFileSourceOptions,
): Promise<FileSource> {
  const {
    rootHandle,
    rootName = rootHandle.name,
    onProgress,
    skipTestLikeDirs = true,
    respectGitignore = true,
  } = options;
  const fileHandles = new Map<string, FileSystemFileHandle>();
  const ig = respectGitignore ? await loadRootGitignore(rootHandle) : ignore();
  let listed = false;

  async function ensureListed(): Promise<void> {
    if (listed) return;
    let visited = 0;
    await walk(
      rootHandle,
      '',
      fileHandles,
      () => {
        visited++;
        if (visited % 50 === 0) onProgress?.(visited);
      },
      skipTestLikeDirs,
      ig,
    );
    onProgress?.(visited);
    listed = true;
  }

  return {
    rootPath: rootName,
    async list(): Promise<string[]> {
      await ensureListed();
      return [...fileHandles.keys()].sort();
    },
    async read(rel: string): Promise<string> {
      // cache is extension-filtered, so config files need a fallback lookup
      await ensureListed();
      const cached = fileHandles.get(rel);
      if (cached) return (await cached.getFile()).text();
      const handle = await resolveFileHandle(rootHandle, rel);
      if (!handle) throw new Error(`File not found: ${rel}`);
      return (await handle.getFile()).text();
    },
    async exists(rel: string): Promise<boolean> {
      await ensureListed();
      if (fileHandles.has(rel)) return true;
      return (await resolveFileHandle(rootHandle, rel)) !== null;
    },
  };
}

async function resolveFileHandle(
  root: FileSystemDirectoryHandle,
  rel: string,
): Promise<FileSystemFileHandle | null> {
  const segments = rel.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < segments.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(segments[i]!);
    } catch {
      return null;
    }
  }
  try {
    return await dir.getFileHandle(segments[segments.length - 1]!);
  } catch {
    return null;
  }
}

async function walk(
  dir: FileSystemDirectoryHandle,
  relDir: string,
  out: Map<string, FileSystemFileHandle>,
  onVisit: () => void,
  skipTestLikeDirs: boolean,
  ig: Ignore,
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    const relPath = relDir ? `${relDir}/${name}` : name;
    if (handle.kind === 'directory') {
      if (ALWAYS_SKIP_DIRS.has(name)) continue;
      if (skipTestLikeDirs && TEST_LIKE_DIRS.has(name)) continue;
      if (ig.ignores(`${relPath}/`)) continue;
      await walk(handle as FileSystemDirectoryHandle, relPath, out, onVisit, skipTestLikeDirs, ig);
      continue;
    }
    const ext = extOf(name);
    if (!SUPPORTED_EXT.has(ext)) continue;
    if (ig.ignores(relPath)) continue;
    out.set(relPath, handle as FileSystemFileHandle);
    onVisit();
  }
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}
