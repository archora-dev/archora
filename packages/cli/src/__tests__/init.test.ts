import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../argv';
import { runInit } from '../commands/init';

describe('cli init', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a starter config in dry-run mode without writing a file', async () => {
    const dir = await makeProject({
      'package.json': JSON.stringify({ devDependencies: { vite: '^5.0.0' } }),
      'vite.config.ts': 'export default {}',
      'src/main.ts': 'import "./App.vue";',
      'src/App.vue': '<template />',
    });
    const out = captureStdout();

    await expect(runInit(parseArgv(['init', dir, '--dry-run', '--quiet']))).resolves.toBe(0);

    const parsed = JSON.parse(out.flush()) as { $schema: string; entryPoints: string[] };
    expect(parsed.$schema).toBe('https://docs.archora.dev/archora.schema.json');
    expect(parsed.entryPoints).toEqual(['src/main.ts']);
    await expect(readFile(join(dir, '.archora.json'), 'utf-8')).rejects.toThrow();
  });

  it('writes .archora.json and refuses to overwrite it without --force', async () => {
    const dir = await makeProject({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/ui/src/index.ts': 'export const ui = true;',
    });

    await expect(runInit(parseArgv(['init', dir, '--quiet']))).resolves.toBe(0);

    const text = await readFile(join(dir, '.archora.json'), 'utf-8');
    expect(JSON.parse(text)).toMatchObject({
      entryPoints: ['packages/ui/src/index.ts'],
      contracts: {
        boundaries: [{ name: 'packages-through-public-api' }],
      },
    });

    await expect(runInit(parseArgv(['init', dir, '--quiet']))).resolves.toBe(2);

    await expect(runInit(parseArgv(['init', dir, '--force', '--quiet']))).resolves.toBe(0);
  });
});

function captureStdout(): { flush(): string } {
  let output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  });
  return {
    flush() {
      const value = output;
      output = '';
      return value;
    },
  };
}

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'archora-cli-init-'));
  for (const [rel, text] of Object.entries(files)) {
    const path = join(dir, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf-8');
  }
  return dir;
}
