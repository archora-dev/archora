import { describe, it, expect } from 'vitest';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';
import { detectFramework } from '../detect';

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}): string =>
  JSON.stringify({ dependencies: deps, devDependencies: dev });

describe('detectFramework', () => {
  it('returns generic when package.json is missing', async () => {
    const src = createInMemoryFileSource('/p', {});
    expect(await detectFramework(src)).toEqual({ framework: 'generic', signals: [] });
  });

  it('returns generic on malformed package.json', async () => {
    const src = createInMemoryFileSource('/p', { 'package.json': '{ not json' });
    expect(await detectFramework(src)).toEqual({ framework: 'generic', signals: [] });
  });

  it('detects vue', async () => {
    const src = createInMemoryFileSource('/p', { 'package.json': pkg({ vue: '^3.0.0' }) });
    expect(await detectFramework(src)).toEqual({ framework: 'vue', signals: ['vue'] });
  });

  it('detects react', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': pkg({ react: '^18.0.0', 'react-dom': '^18.0.0' }),
    });
    expect(await detectFramework(src)).toEqual({ framework: 'react', signals: ['react'] });
  });

  it('detects svelte', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': pkg({}, { svelte: '^4.0.0' }),
    });
    expect(await detectFramework(src)).toEqual({ framework: 'svelte', signals: ['svelte'] });
  });

  it('prefers nuxt over vue when both present', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': pkg({ vue: '^3.0.0', nuxt: '^3.0.0' }),
    });
    const result = await detectFramework(src);
    expect(result.framework).toBe('nuxt');
    expect(result.signals).toEqual(expect.arrayContaining(['nuxt', 'vue']));
  });

  it('prefers next over react when both present', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': pkg({ react: '^18.0.0', next: '^14.0.0' }),
    });
    const result = await detectFramework(src);
    expect(result.framework).toBe('next');
    expect(result.signals).toEqual(expect.arrayContaining(['next', 'react']));
  });

  it('reads devDependencies as well as dependencies', async () => {
    const src = createInMemoryFileSource('/p', {
      'package.json': JSON.stringify({ devDependencies: { vue: '^3.0.0' } }),
    });
    expect((await detectFramework(src)).framework).toBe('vue');
  });
});
