import { describe, expect, it } from 'vitest';
import { analyze } from '..';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';

describe('async lifecycle risk analysis', () => {
  it('flags a React effect that fetches without abort or stale guard', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect, useState } from 'react';

          export function App() {
            const [name, setName] = useState('');
            useEffect(() => {
              fetch('/api/user')
                .then((res) => res.text())
                .then(setName);
            }, []);
            return <div>{name}</div>;
          }
        `,
      }),
    );

    expect(result.asyncLifecycleRisks).toEqual([
      expect.objectContaining({
        kind: 'async-effect-cleanup',
        moduleId: 'src/App.tsx',
        framework: 'react',
        confidence: 'high',
      }),
    ]);
    expect(result.signals?.some((signal) => signal.kind === 'async-lifecycle-risk')).toBe(true);
  });

  it('keeps a React effect with AbortController clean', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
        'src/App.tsx': `
          import { useEffect, useState } from 'react';

          export function App() {
            const [name, setName] = useState('');
            useEffect(() => {
              const controller = new AbortController();
              fetch('/api/user', { signal: controller.signal })
                .then((res) => res.text())
                .then(setName);
              return () => controller.abort();
            }, []);
            return <div>{name}</div>;
          }
        `,
      }),
    );

    expect(result.asyncLifecycleRisks ?? []).toEqual([]);
  });

  it('flags Vue mounted async work without unmounted guard', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
        'tsconfig.json': '{}',
        'src/App.vue': `
          <script setup lang="ts">
          import { onMounted, ref } from 'vue';

          const name = ref('');
          onMounted(async () => {
            const res = await fetch('/api/user');
            name.value = await res.text();
          });
          </script>
        `,
      }),
    );

    expect(result.asyncLifecycleRisks).toEqual([
      expect.objectContaining({
        kind: 'async-effect-cleanup',
        moduleId: 'src/App.vue',
        framework: 'vue',
        confidence: 'high',
      }),
    ]);
  });

  it('flags Svelte onMount async work without returned cleanup', async () => {
    const result = await analyze(
      createInMemoryFileSource('/p', {
        'package.json': JSON.stringify({ devDependencies: { svelte: '^4.0.0' } }),
        'tsconfig.json': '{}',
        'src/App.svelte': `
          <script lang="ts">
            import { onMount } from 'svelte';

            let name = '';
            onMount(() => {
              fetch('/api/user')
                .then((res) => res.text())
                .then((value) => { name = value; });
            });
          </script>
        `,
      }),
    );

    expect(result.asyncLifecycleRisks).toEqual([
      expect.objectContaining({
        kind: 'async-effect-cleanup',
        moduleId: 'src/App.svelte',
        framework: 'svelte',
        confidence: 'high',
      }),
    ]);
  });
});
