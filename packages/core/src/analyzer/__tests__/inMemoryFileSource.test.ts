import { describe, it, expect } from 'vitest';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';
import { analyze } from '../index';

describe('inMemoryFileSource', () => {
  it('lists, reads, and reports existence', async () => {
    const src = createInMemoryFileSource('/proj', {
      'a.ts': 'export const a = 1;',
      'b.ts': 'export const b = 2;',
    });
    expect(await src.list()).toEqual(['a.ts', 'b.ts']);
    expect(await src.read('a.ts')).toBe('export const a = 1;');
    expect(await src.exists('a.ts')).toBe(true);
    expect(await src.exists('missing.ts')).toBe(false);
  });

  it('throws on read of missing file', async () => {
    const src = createInMemoryFileSource('/proj', {});
    await expect(src.read('x.ts')).rejects.toThrow();
  });

  it('feeds the full analyzer pipeline end-to-end', async () => {
    const src = createInMemoryFileSource('/proj', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.' } }),
      'src/a.ts': "import { b } from './b';\nexport const a = b + 1;",
      'src/b.ts': 'export const b = 2;',
    });
    const result = await analyze(src);
    expect(result.project.detectedFramework).toBe('vue');
    expect(result.modules.map((m) => m.id).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.edges.some((e) => e.from === 'src/a.ts' && e.to === 'src/b.ts')).toBe(true);
  });
});
