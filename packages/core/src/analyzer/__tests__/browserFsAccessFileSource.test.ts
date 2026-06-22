import { describe, it, expect } from 'vitest';
import { createBrowserFsAccessFileSource } from '../sources/browserFsAccessFileSource';

// minimal FS Access handle mock - only the methods the source touches
type MockTree = { [name: string]: string | MockTree };

function makeFileHandle(content: string): unknown {
  return {
    kind: 'file',
    async getFile() {
      return {
        text: () => Promise.resolve(content),
      };
    },
  };
}

function makeDirHandle(name: string, tree: MockTree): unknown {
  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const [child, value] of Object.entries(tree)) {
        if (typeof value === 'string') {
          yield [child, makeFileHandle(value)];
        } else {
          yield [child, makeDirHandle(child, value)];
        }
      }
    },
    async getDirectoryHandle(child: string): Promise<unknown> {
      const v = tree[child];
      if (!v || typeof v === 'string') throw new Error(`No such dir: ${child}`);
      return makeDirHandle(child, v);
    },
    async getFileHandle(child: string): Promise<unknown> {
      const v = tree[child];
      if (typeof v !== 'string') throw new Error(`No such file: ${child}`);
      return makeFileHandle(v);
    },
  };
}

describe('browserFsAccessFileSource', () => {
  it('list() filters by SUPPORTED_EXT (config files excluded)', async () => {
    const root = makeDirHandle('proj', {
      'tsconfig.json': '{}',
      'package.json': '{}',
      'README.md': 'docs',
      src: { 'main.ts': 'export {}' },
    });
    const source = await createBrowserFsAccessFileSource({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rootHandle: root as any,
    });
    const list = await source.list();
    expect(list).toEqual(['src/main.ts']);
  });

  it('exists() resolves config files outside SUPPORTED_EXT', async () => {
    const root = makeDirHandle('proj', {
      'tsconfig.json': '{}',
      '.archora.json': '{}',
      src: { 'main.ts': 'export {}' },
    });
    const source = await createBrowserFsAccessFileSource({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rootHandle: root as any,
    });
    expect(await source.exists('tsconfig.json')).toBe(true);
    expect(await source.exists('.archora.json')).toBe(true);
    expect(await source.exists('src/main.ts')).toBe(true);
    expect(await source.exists('missing.json')).toBe(false);
  });

  it('read() returns config files outside SUPPORTED_EXT', async () => {
    const root = makeDirHandle('proj', {
      'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}',
      src: { 'main.ts': 'import x from "@/x"' },
    });
    const source = await createBrowserFsAccessFileSource({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rootHandle: root as any,
    });
    expect(await source.read('tsconfig.json')).toContain('"paths"');
    expect(await source.read('src/main.ts')).toContain('@/x');
  });

  it('read() throws on non-existent path', async () => {
    const root = makeDirHandle('proj', { src: { 'a.ts': 'x' } });
    const source = await createBrowserFsAccessFileSource({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rootHandle: root as any,
    });
    await expect(source.read('nope.json')).rejects.toThrow();
  });
});
