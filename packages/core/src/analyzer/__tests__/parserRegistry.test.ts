import { describe, it, expect } from 'vitest';
import { createParserRegistry, isParseFailure } from '../parsers';
import type { ParsedFile } from '../types';

describe('parserRegistry', () => {
  const registry = createParserRegistry();

  it('routes .ts files to TS parser', () => {
    const r = registry.parse({
      relPath: 'a.ts',
      content: "import { x } from './b';\nexport const a = x;",
    });
    expect(isParseFailure(r)).toBe(false);
    const parsed = r as ParsedFile;
    expect(parsed.language).toBe('ts');
    expect(parsed.imports.map((i) => i.specifier)).toEqual(['./b']);
  });

  it('routes .tsx files to TS parser as ts language', () => {
    const r = registry.parse({
      relPath: 'a.tsx',
      content: 'export const A = () => null;',
    });
    expect((r as ParsedFile).language).toBe('ts');
  });

  it('routes .jsx/.mjs/.cjs files to TS parser as js language', () => {
    for (const ext of ['jsx', 'mjs', 'cjs']) {
      const r = registry.parse({ relPath: `a.${ext}`, content: 'export const a = 1;' });
      expect((r as ParsedFile).language).toBe('js');
    }
  });

  it('routes .vue files to Vue parser', () => {
    const sfc = `<script setup lang="ts">
import { ref } from 'vue';
const x = ref(1);
</script>`;
    const r = registry.parse({ relPath: 'A.vue', content: sfc });
    expect(isParseFailure(r)).toBe(false);
    expect((r as ParsedFile).language).toBe('vue');
  });

  it('returns failure on unsupported extension', () => {
    const r = registry.parse({ relPath: 'a.css', content: 'body { color: red; }' });
    expect(isParseFailure(r)).toBe(true);
    if (isParseFailure(r)) expect(r.reason).toBe('unsupported-extension');
  });

  it('returns failure on extensionless files', () => {
    const r = registry.parse({ relPath: 'README', content: '' });
    expect(isParseFailure(r)).toBe(true);
  });
});
