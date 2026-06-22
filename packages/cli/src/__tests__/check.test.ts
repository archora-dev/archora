import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../argv';
import { runCheck } from '../commands/check';

describe('check command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses architectureBudget from .archora.json when no --fail-on is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'archora-check-budget-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src/main.ts'), "import './a';\n", 'utf-8');
    await writeFile(join(dir, 'src/a.ts'), "import './b';\nexport const a = true;\n", 'utf-8');
    await writeFile(join(dir, 'src/b.ts'), "import './a';\nexport const b = true;\n", 'utf-8');
    await writeFile(
      join(dir, '.archora.json'),
      JSON.stringify({ architectureBudget: { maxCycles: 0 } }),
      'utf-8',
    );
    const err = captureStderr();

    await expect(runCheck(parseArgv(['check', dir, '--quiet']))).resolves.toBe(1);

    expect(err.flush()).toContain('architectureBudget');
  });
});

function captureStderr(): { flush(): string } {
  let output = '';
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
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
