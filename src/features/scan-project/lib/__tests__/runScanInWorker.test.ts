import { describe, expect, it, vi } from 'vitest';
import { EXTRA_SNAPSHOT_FILES } from '../runScanInWorker';
import type { FileSource } from '@/core/analyzer/fileSource';

// Worker-snapshot regression test: a bug surfaced where
// `.archora.json` (config) didn't ship with the worker snapshot because
// `source.list()` is extension-filtered. We re-implement the snapshot loop
// inline here and assert the config files are pulled via the same fallback.

async function snapshot(source: FileSource): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const all = await source.list();
  for (const rel of all) files[rel] = await source.read(rel);
  for (const rel of EXTRA_SNAPSHOT_FILES) {
    if (await source.exists(rel)) files[rel] = await source.read(rel);
  }
  return files;
}

function makeSource(files: Record<string, string>, listing: string[]): FileSource {
  return {
    rootPath: '/proj',
    list: vi.fn(async () => listing),
    read: vi.fn(async (rel: string) => {
      if (!(rel in files)) throw new Error(`not found: ${rel}`);
      return files[rel]!;
    }),
    exists: vi.fn(async (rel: string) => rel in files),
  };
}

describe('worker snapshot', () => {
  it('includes .archora.json even when list() filters it out', async () => {
    const source = makeSource(
      {
        'src/a.ts': 'export {}',
        '.archora.json': '{"contracts":{"boundaries":[]}}',
      },
      ['src/a.ts'], // listing is extension-filtered, no config
    );
    const snap = await snapshot(source);
    expect(snap['src/a.ts']).toBe('export {}');
    expect(snap['.archora.json']).toBe('{"contracts":{"boundaries":[]}}');
  });

  it('skips config files that do not exist', async () => {
    const source = makeSource({ 'src/a.ts': 'export {}' }, ['src/a.ts']);
    const snap = await snapshot(source);
    expect('.archora.json' in snap).toBe(false);
    expect('archora.json' in snap).toBe(false);
  });
});
