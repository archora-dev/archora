import { describe, expect, it } from 'vitest';
import { analyze } from '..';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';

describe('memory risk analysis', () => {
  it('flags a React effect that registers an event listener without cleanup', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect } from 'react';

          export function App() {
            useEffect(() => {
              window.addEventListener('resize', () => {});
            }, []);
            return null;
          }
        `,
      }),
    );

    expect(result.memoryRisks).toEqual([
      expect.objectContaining({
        kind: 'event-listener-cleanup',
        moduleId: 'src/App.tsx',
        framework: 'react',
        confidence: 'high',
      }),
    ]);
    expect(result.signals?.some((signal) => signal.kind === 'memory-risk')).toBe(true);
  });

  it('keeps a React effect with matching cleanup clean', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect } from 'react';

          export function App() {
            useEffect(() => {
              const onResize = () => {};
              window.addEventListener('resize', onResize);
              return () => window.removeEventListener('resize', onResize);
            }, []);
            return null;
          }
        `,
      }),
    );

    expect(result.memoryRisks ?? []).toEqual([]);
  });

  it('flags Vue mounted listeners without an unmounted cleanup', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
        'tsconfig.json': '{}',
        'src/App.vue': `
          <script setup lang="ts">
          import { onMounted } from 'vue';

          onMounted(() => {
            window.addEventListener('scroll', () => {});
          });
          </script>
        `,
      }),
    );

    expect(result.memoryRisks).toEqual([
      expect.objectContaining({
        kind: 'event-listener-cleanup',
        moduleId: 'src/App.vue',
        framework: 'vue',
        confidence: 'high',
      }),
    ]);
  });

  it('flags Svelte subscriptions without returned cleanup', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ devDependencies: { svelte: '^4.0.0' } }),
        'tsconfig.json': '{}',
        'src/App.svelte': `
          <script lang="ts">
            import { onMount } from 'svelte';
            import { writable } from 'svelte/store';

            const count = writable(0);
            onMount(() => {
              count.subscribe(() => {});
            });
          </script>
        `,
      }),
    );

    expect(result.memoryRisks).toEqual([
      expect.objectContaining({
        kind: 'subscription-cleanup',
        moduleId: 'src/App.svelte',
        framework: 'svelte',
        confidence: 'high',
      }),
    ]);
  });

  it('does not flag a bare fire-and-forget setTimeout', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect } from 'react';

          export function App() {
            useEffect(() => {
              setTimeout(() => window.removeEventListener('x', () => {}), 100);
            }, []);
            return null;
          }
        `,
      }),
    );

    expect((result.memoryRisks ?? []).filter((risk) => risk.kind === 'timer-cleanup')).toEqual([]);
  });

  it('flags a captured setTimeout handle without clearTimeout', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect } from 'react';

          export function App() {
            useEffect(() => {
              const id = setTimeout(() => {}, 100);
              return undefined;
            }, []);
            return null;
          }
        `,
      }),
    );

    expect(result.memoryRisks).toEqual([
      expect.objectContaining({
        kind: 'timer-cleanup',
        moduleId: 'src/App.tsx',
        framework: 'react',
      }),
    ]);
  });

  it('keeps a captured setTimeout with clearTimeout clean', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect } from 'react';

          export function App() {
            useEffect(() => {
              const id = setTimeout(() => {}, 100);
              return () => clearTimeout(id);
            }, []);
            return null;
          }
        `,
      }),
    );

    expect((result.memoryRisks ?? []).filter((risk) => risk.kind === 'timer-cleanup')).toEqual([]);
  });

  it('still flags setInterval without clearInterval', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect } from 'react';

          export function App() {
            useEffect(() => {
              setInterval(() => {}, 1000);
            }, []);
            return null;
          }
        `,
      }),
    );

    expect(result.memoryRisks).toEqual([
      expect.objectContaining({ kind: 'timer-cleanup', moduleId: 'src/App.tsx' }),
    ]);
  });

  it('does not flag Next server modules as browser memory risks', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'preserve' } }),
        'app/page.tsx': `
          'use server';

          export default function Page() {
            setInterval(() => {}, 1000);
            return null;
          }
        `,
      }),
    );

    expect(result.memoryRisks ?? []).toEqual([]);
  });
});
