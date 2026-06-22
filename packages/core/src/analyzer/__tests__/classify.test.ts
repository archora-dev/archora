import { describe, it, expect } from 'vitest';
import { isInfra, classifyKind } from '../classify';
import type { ParsedFile } from '../types';

const parsed = (over: Partial<ParsedFile> = {}): ParsedFile => ({
  relPath: '',
  language: 'ts',
  exports: [],
  imports: [],
  hasDefineStore: false,
  loc: 10,
  ...over,
});

describe('isInfra', () => {
  it.each([
    'src/types.d.ts',
    'vite.config.ts',
    'vitest.config.ts',
    'rollup.config.mjs',
    'webpack.config.js',
    'astro.config.mjs',
    'playwright.config.ts',
    'eslint.config.js',
    '.eslintrc.cjs',
    'postcss.config.cjs',
    'tailwind.config.ts',
  ])('treats %s as infra', (path) => {
    expect(isInfra(path)).toBe(true);
  });

  it.each([
    'src/main.ts',
    'src/components/Button.vue',
    'src/utils/format.ts',
    'src/api/users.config.profile.ts',
  ])('keeps %s as regular', (path) => {
    expect(isInfra(path)).toBe(false);
  });
});

describe('classifyKind', () => {
  it('vue file → component', () => {
    expect(classifyKind(parsed({ language: 'vue' }), 'src/X.vue')).toBe('component');
  });

  it('svelte file → component', () => {
    expect(classifyKind(parsed({ language: 'svelte' }), 'src/X.svelte')).toBe('component');
  });

  it('defineStore call → store regardless of path', () => {
    expect(classifyKind(parsed({ hasDefineStore: true }), 'src/random.ts')).toBe('store');
  });

  it('composables/ folder → composable', () => {
    expect(classifyKind(parsed(), 'src/composables/useX.ts')).toBe('composable');
  });

  it('useFoo.ts at any path → composable', () => {
    expect(classifyKind(parsed(), 'src/lib/useDebounce.ts')).toBe('composable');
  });

  it('exported `use*` function → composable even with neutral name', () => {
    expect(classifyKind(parsed({ exports: ['useTheme'] }), 'src/lib/theme.ts')).toBe('composable');
  });

  it('router file → route', () => {
    expect(classifyKind(parsed(), 'src/router/index.ts')).toBe('route');
  });

  it('utils/lib/helpers folders → util', () => {
    expect(classifyKind(parsed(), 'src/utils/format.ts')).toBe('util');
    expect(classifyKind(parsed(), 'src/lib/cn.ts')).toBe('util');
    expect(classifyKind(parsed(), 'src/helpers/x.ts')).toBe('util');
  });

  it('main/index/entry → entry', () => {
    expect(classifyKind(parsed(), 'src/main.ts')).toBe('entry');
    expect(classifyKind(parsed(), 'src/index.ts')).toBe('entry');
  });

  it('XLoader / XPlugin / XRegistry / XProvider → integration', () => {
    expect(classifyKind(parsed(), 'src/services/AuthLoader.ts')).toBe('integration');
    expect(classifyKind(parsed(), 'src/plugins/MyPlugin.ts')).toBe('integration');
  });

  it('recognizes common project roles outside FSD', () => {
    expect(classifyKind(parsed(), 'src/api/person.ts')).toBe('api');
    expect(classifyKind(parsed(), 'src/services/personClient.ts')).toBe('service');
    expect(classifyKind(parsed(), 'src/model/session.ts')).toBe('model');
    expect(classifyKind(parsed(), 'src/types/person.ts')).toBe('schema');
    expect(classifyKind(parsed(), 'src/config/routes.ts')).toBe('config');
    expect(classifyKind(parsed(), 'src/__tests__/session.test.ts')).toBe('test');
  });

  it('uses a project module fallback otherwise', () => {
    expect(classifyKind(parsed(), 'src/random/file.ts')).toBe('module');
  });
});
