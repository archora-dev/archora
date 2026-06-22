import { describe, it, expect } from 'vitest';
import type { FileSource } from '../fileSource';
import { createNodeFsFileSource } from '../sources/nodeFsFileSource';
import { discoverFiles } from '../discover';
import { fixturePath } from './_paths';

function inMemorySource(files: string[]): FileSource {
  return {
    rootPath: '/virtual',
    list: () => Promise.resolve(files),
    read: () => Promise.reject(new Error('read not used')),
    exists: (p) => Promise.resolve(files.includes(p)),
  };
}

describe('discover', () => {
  it('lists supported files and skips node_modules-like dirs', async () => {
    const src = await createNodeFsFileSource({ rootPath: fixturePath('sample-vue-app') });
    const { files, byExt } = await discoverFiles(src);
    expect(files.length).toBeGreaterThan(20);
    expect(files.every((f) => !f.startsWith('node_modules'))).toBe(true);
    expect(byExt['.vue']).toBeGreaterThan(0);
    expect(byExt['.ts']).toBeGreaterThan(0);
  });

  it('excludes tests, stories, declarations and configs by default', async () => {
    const src = inMemorySource([
      'src/foo.ts',
      'src/foo.test.ts',
      'src/foo.spec.tsx',
      'src/__tests__/bar.ts',
      'src/__mocks__/baz.ts',
      'src/__snapshots__/snap.ts',
      'src/Button.stories.ts',
      'src/Button.stories.vue',
      'types/global.d.ts',
      'types/global.d.mts',
      'vite.config.ts',
      'vitest.config.mts',
      'eslint.config.js',
      'tailwind.config.cjs',
      'cypress/e2e/login.cy.ts',
      'playwright/test.spec.ts',
      'e2e/login.ts',
      '.storybook/main.ts',
      'src/keep.vue',
    ]);
    const { files, skipped } = await discoverFiles(src);
    expect(files.sort()).toEqual(['src/foo.ts', 'src/keep.vue']);
    expect(skipped).toBe(17);
  });

  it('respects opt-out flags', async () => {
    const src = inMemorySource([
      'src/foo.test.ts',
      'src/Button.stories.ts',
      'a.d.ts',
      'vite.config.ts',
    ]);
    const { files } = await discoverFiles(src, {
      excludeTests: false,
      excludeStories: false,
      excludeDeclarations: false,
      excludeConfigs: false,
    });
    expect(files).toHaveLength(4);
  });
});
