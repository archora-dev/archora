import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgv } from '../argv';
import { runBaseline } from '../commands/baseline';

describe('baseline command', () => {
  it('writes an analyzer snapshot for intentional baseline updates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'archora-baseline-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src/main.ts'), 'export const app = true;\n', 'utf-8');
    const out = join(dir, '.archora', 'baseline.json');

    await expect(
      runBaseline(parseArgv(['baseline', 'write', dir, '--output', out, '--quiet'])),
    ).resolves.toBe(0);

    await expect(stat(out)).resolves.toMatchObject({ size: expect.any(Number) });
    const parsed = JSON.parse(await readFile(out, 'utf-8')) as { scan?: unknown };
    expect(parsed.scan).toBeTruthy();
  });
});
