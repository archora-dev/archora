import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../argv';
import { runScan } from '../commands/scan';

async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out += String(chunk);
    return true;
  });
  try {
    const code = await fn();
    return { code, out };
  } finally {
    spy.mockRestore();
  }
}

describe('scan command (zero-config first run)', () => {
  it('prints grade, counts and a prioritized fix list with no config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'archora-scan-'));
    try {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
      // a <-> b is a genuine value cycle, so there is always a "fix first" item.
      await writeFile(
        join(root, 'src', 'a.ts'),
        "import { b } from './b';\nexport const a = () => b();\n",
      );
      await writeFile(
        join(root, 'src', 'b.ts'),
        "import { a } from './a';\nexport const b = () => a();\n",
      );

      const { code, out } = await captureStdout(() =>
        runScan(parseArgv(['scan', root, '--no-cache'])),
      );

      expect(code).toBe(0);
      expect(out).toContain('Archora');
      expect(out).toMatch(/Grade [A-F]/);
      expect(out).toContain('Fix this first');
      expect(out).toMatch(/\d+ modules/);
      // color must be absent when stdout is not a TTY (test env)
      expect(out).not.toContain('[');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('shows a friendly empty state when there are no source files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'archora-scan-empty-'));
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
      const { code, out } = await captureStdout(() =>
        runScan(parseArgv(['scan', root, '--no-cache'])),
      );
      expect(code).toBe(0);
      expect(out).toContain('No source files found');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
