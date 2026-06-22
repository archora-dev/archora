import { describe, it, expect } from 'vitest';
import { createParserRegistry, isParseFailure } from '../parsers';
import type { ParsedFile } from '../types';

const parseSvelte = (relPath: string, content: string): ParsedFile => {
  const registry = createParserRegistry({ framework: 'svelte' });
  const r = registry.parse({ relPath, content });
  if (isParseFailure(r)) throw new Error(`unexpected parse failure: ${r.reason}`);
  return r;
};

describe('svelteParser', () => {
  it('extracts static imports from <script lang="ts">', () => {
    const sfc = `
<script lang="ts">
  import Header from './Header.svelte';
  import { theme } from './stores/theme';
  export let route: string = 'home';
</script>

<header><Header /></header>
`;
    const file = parseSvelte('App.svelte', sfc);
    expect(file.language).toBe('svelte');
    const specs = file.imports.filter((i) => i.kind === 'static').map((i) => i.specifier);
    expect(specs).toEqual(expect.arrayContaining(['./Header.svelte', './stores/theme']));
  });

  it('extracts dynamic import() inside script as dynamic edge', () => {
    const sfc = `
<script lang="ts">
  const lazyPage = import('./routes/Settings.svelte');
</script>

{#await lazyPage then mod}
  <svelte:component this={mod.default} />
{/await}
`;
    const file = parseSvelte('App.svelte', sfc);
    const dynamic = file.imports.filter((i) => i.kind === 'dynamic').map((i) => i.specifier);
    expect(dynamic).toContain('./routes/Settings.svelte');
  });

  it('handles <script context="module"> in addition to <script>', () => {
    const sfc = `
<script context="module" lang="ts">
  import { sharedConfig } from './shared';
  export const meta = { name: 'page' };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import Footer from './Footer.svelte';
  let mounted = false;
  onMount(() => { mounted = true; });
</script>

<Footer />
`;
    const file = parseSvelte('Page.svelte', sfc);
    const specs = file.imports.map((i) => i.specifier);
    expect(specs).toEqual(expect.arrayContaining(['./shared', 'svelte', './Footer.svelte']));
  });

  it('treats template-only .svelte (no <script>) as zero-import file, not a failure', () => {
    const file = parseSvelte(
      'Icon.svelte',
      `<svg width="16" height="16"><circle cx="8" cy="8" r="7" /></svg>`,
    );
    expect(file.language).toBe('svelte');
    expect(file.imports).toEqual([]);
  });

  it('script tag is matched case-insensitively and tolerates whitespace', () => {
    const sfc = `<SCRIPT lang="ts" >
  import { foo } from './foo';
</  Script   >`;
    const file = parseSvelte('Weird.svelte', sfc);
    expect(file.imports.map((i) => i.specifier)).toContain('./foo');
  });

  it('reports loc of the entire SFC, not just the script', () => {
    const sfc = `<script lang="ts">
  import x from './x';
</script>

<div>line</div>
<div>line</div>
<div>line</div>
`;
    const file = parseSvelte('A.svelte', sfc);
    expect(file.loc).toBeGreaterThan(5);
  });
});

describe('parserRegistry: .svelte routing', () => {
  it('routes .svelte to svelteParser regardless of framework', () => {
    for (const framework of ['svelte', 'vue', 'react', 'unknown'] as const) {
      const registry = createParserRegistry({ framework });
      const r = registry.parse({
        relPath: 'A.svelte',
        content: `<script>import x from './x';</script>`,
      });
      expect(isParseFailure(r)).toBe(false);
      expect((r as ParsedFile).language).toBe('svelte');
    }
  });
});
