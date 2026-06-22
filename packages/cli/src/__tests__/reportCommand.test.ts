import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgv } from '../argv';
import { runReport } from '../commands/report';

describe('report command', () => {
  it('includes churn-aware fix-plan actions when git history is enabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'archora-report-git-'));
    try {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'hot.ts'), 'export const hot = 1;\n');
      await writeFile(join(root, 'src', 'dep.ts'), 'export const dep = 1;\n');
      for (let i = 0; i < 10; i++) {
        await writeFile(join(root, 'src', `consumer-${i}.ts`), `import { hot } from './hot';\n`);
      }

      git(root, 'init');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'initial');

      for (let i = 2; i <= 6; i++) {
        await writeFile(
          join(root, 'src', 'hot.ts'),
          `import { dep } from './dep';\nexport const hot = dep + ${i};\n`,
        );
        git(root, 'add', 'src/hot.ts');
        git(root, 'commit', '-m', `touch hot ${i}`);
      }

      const out = captureStdout();
      try {
        await expect(
          runReport(
            parseArgv([
              'report',
              root,
              '--format',
              'fix-plan',
              '--git-history',
              '--git-since',
              '10y',
              '--quiet',
            ]),
          ),
        ).resolves.toBe(0);

        const plan = JSON.parse(out.flush()) as {
          priorityFindings: Array<{ id: string; action: string; reason: string }>;
        };
        const hot = plan.priorityFindings.find((finding) => finding.id === 'src/hot.ts');
        expect(hot?.action).toContain('Coordinate the change with recent owners first');
        expect(hot?.reason).toContain('6 commits');
      } finally {
        out.restore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-05-20T10:00:00Z',
      GIT_COMMITTER_DATE: '2026-05-20T10:00:00Z',
    },
  });
}

function captureStdout(): { flush(): string; restore(): void } {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  return {
    flush() {
      return output;
    },
    restore() {
      process.stdout.write = original;
    },
  };
}
