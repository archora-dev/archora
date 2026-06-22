import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

async function readFeatureFile(relativePath: string): Promise<string> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return readFile(resolve(currentDir, '../../..', relativePath), 'utf8');
}

describe('scan project startup imports', () => {
  it('keeps analyzer execution out of the runScan top-level module', async () => {
    const source = await readFeatureFile('scan-project/lib/runScan.ts');

    expect(source).not.toMatch(
      /import\s+\{[^}]*\banalyze\b[^}]*\}\s+from ['"]@\/core\/analyzer['"]/,
    );
    expect(source).not.toMatch(
      /import\s+\{[^}]*\bincrementalAnalyze\b[^}]*\}\s+from ['"]@\/core\/analyzer['"]/,
    );
  });

  it('creates project file sources from action-level imports', async () => {
    const source = await readFeatureFile('open-project/lib/pickDirectory.ts');

    expect(source).not.toMatch(/import\s+\{[^}]*createBrowserFsAccessFileSource[^}]*\}/);
    expect(source).not.toMatch(/import\s+\{[^}]*createTauriFileSource[^}]*\}/);
  });

  it('does not import the core barrel from startup UI modules', async () => {
    // CommandPalette is mounted in AppShell on every route — it must not pull
    // in the core barrel at startup (keeps the initial bundle lean).
    const source = await readFeatureFile('../widgets/command-palette/ui/CommandPalette.vue');

    expect(source).not.toContain("from '@/core'");
    expect(source).not.toContain('from "@/core"');
  });
});
