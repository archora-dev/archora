import type { FileSource } from '../fileSource';

// in-memory FileSource for tests + the worker pipeline
export function createInMemoryFileSource(
  rootPath: string,
  files: Record<string, string>,
): FileSource {
  return {
    rootPath,
    async list(): Promise<string[]> {
      return Object.keys(files);
    },
    async read(relativePath: string): Promise<string> {
      const content = files[relativePath];
      if (content === undefined) {
        throw new Error(`InMemoryFileSource: file not found "${relativePath}"`);
      }
      return content;
    },
    async exists(relativePath: string): Promise<boolean> {
      return relativePath in files;
    },
  };
}
