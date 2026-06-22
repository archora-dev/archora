import type { FileSource } from '../fileSource';

interface TauriInvoke {
  <T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

export interface TauriFileSourceOptions {
  rootPath: string;
  rootName?: string;
  invoke: TauriInvoke;
  /** Extra ignore globs (gitignore syntax), e.g. ['*.test.ts']. */
  extraIgnoreGlobs?: string[];
  /** Hard limit on the size of a file to read, in bytes. Default 2 MB. */
  maxFileBytes?: number;
}

export async function createTauriFileSource(options: TauriFileSourceOptions): Promise<FileSource> {
  const { rootPath, rootName, invoke, extraIgnoreGlobs, maxFileBytes } = options;
  let listing: Promise<Set<string>> | null = null;

  async function ensureListed(): Promise<Set<string>> {
    if (!listing) {
      listing = invoke<string[]>('read_project_tree', {
        root: rootPath,
        options: {
          extraIgnoreGlobs: extraIgnoreGlobs ?? [],
          followSymlinks: false,
        },
      }).then((paths) => new Set(paths));
    }
    return listing;
  }

  return {
    rootPath: rootName ?? rootPath,
    async list(): Promise<string[]> {
      const set = await ensureListed();
      return [...set].sort();
    },
    async read(relativePath: string): Promise<string> {
      return invoke<string>('read_file', {
        root: rootPath,
        relative: relativePath,
        options: maxFileBytes !== undefined ? { maxBytes: maxFileBytes } : {},
      });
    },
    async readMany(relativePaths: readonly string[]): Promise<Record<string, string>> {
      return invoke<Record<string, string>>('read_files', {
        root: rootPath,
        relatives: relativePaths,
        options: maxFileBytes !== undefined ? { maxBytes: maxFileBytes } : {},
      });
    },
    async exists(relativePath: string): Promise<boolean> {
      // listing is extension-filtered; configs miss the cache and need file_exists
      const set = await ensureListed();
      if (set.has(relativePath)) return true;
      try {
        return await invoke<boolean>('file_exists', {
          root: rootPath,
          relative: relativePath,
        });
      } catch {
        return false;
      }
    },
  };
}
