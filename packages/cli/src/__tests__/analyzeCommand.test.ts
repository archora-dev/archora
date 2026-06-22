import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../argv';
import { runAnalyze } from '../commands/analyze';

describe('analyze command', () => {
  it('prints memory-risk summary to stderr without changing JSON stdout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'archora-analyze-memory-'));
    const outFile = join(root, 'scan.json');
    try {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' }, devDependencies: {} }),
      );
      await writeFile(
        join(root, 'src', 'App.tsx'),
        [
          "import { useEffect } from 'react';",
          'export function App() {',
          '  useEffect(() => {',
          "    window.addEventListener('resize', () => undefined);",
          "    fetch('/api/user').then((res) => res.text());",
          '  }, []);',
          '  return null;',
          '}',
          '',
        ].join('\n'),
      );

      const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await expect(
          runAnalyze(parseArgv(['analyze', root, '-o', outFile, '--no-cache'])),
        ).resolves.toBe(0);

        const output = stderr.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('Memory risks: 1');
        expect(output).toContain('Event listener');
        expect(output).toContain('src/App.tsx:4');
        expect(output).toContain('Async lifecycle risks: 1');
        expect(output).toContain('Async lifecycle work');
      } finally {
        stderr.mockRestore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
