import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyzer';
import { createInMemoryFileSource } from '../../analyzer/sources/inMemoryFileSource';
import { applyTypeOnlyFix } from '../applyTypeOnlyFix';

/**
 * End-to-end check: a tiny synthetic project with a cycle whose
 * feedback edge is type-only. After applying the fix, the
 * type-only-candidate insight should disappear from the rescan.
 *
 * a.ts -> b.ts (Foo used only as a type)
 * b.ts -> a.ts (Bar used as a value)
 */
describe('applyTypeOnlyFix integration', () => {
  it('removes the type-only-candidate recommendation after re-scan', async () => {
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ name: 'syn', version: '0.0.0' }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
      'a.ts': [
        `import { runBar } from './b';`,
        `export type Shared = { id: number };`,
        `export function trigger(): number { return runBar(); }`,
        ``,
      ].join('\n'),
      'b.ts': [
        `import { Shared } from './a';`,
        `export function runBar(): number { return 1; }`,
        `export type Wrap = Shared & { kind: 'wrap' };`,
        ``,
      ].join('\n'),
    };

    const source = createInMemoryFileSource('/syn', files);
    const before = await analyze(source);
    const beforeRec = before.recommendations.find((r) => r.kind === 'type-only-candidate');
    expect(beforeRec, 'expected analyzer to surface a type-only-candidate').toBeTruthy();
    const fromFile = beforeRec!.modules[0]!;
    const specifier = String(beforeRec!.params.specifier);
    const bindings = String(beforeRec!.params.bindings)
      .split(',')
      .map((s) => s.trim());
    // Apply the fix textually on whichever side the analyzer chose,
    // then run a fresh analyze on the patched source.
    const patched = applyTypeOnlyFix({
      filePath: fromFile,
      content: files[fromFile]!,
      language: 'ts',
      specifier,
      bindings,
    });
    expect(patched.patchedContent).toContain(`import type`);

    const nextFiles = { ...files, [fromFile]: patched.patchedContent };
    const nextSource = createInMemoryFileSource('/syn', nextFiles);
    const after = await analyze(nextSource);

    const stillThere = after.recommendations.find((r) => r.kind === 'type-only-candidate');
    expect(stillThere, 'type-only-candidate insight should be gone after fix').toBeFalsy();
    // and the cycle itself should be resolved (no SCC of size > 1 left).
    expect(after.cycles.filter((c) => c.modules.length > 1)).toHaveLength(0);
  });
});
