// Beta: extracts script blocks with a regex, without svelte/compiler. Picks up
// imports (static and dynamic) from `<script>` and `<script context="module">`;
// the template and `$:` are not parsed (Svelte resolves components via script
// imports anyway). First-class targets are Vue/React/Nuxt/Next; Svelte is
// deliberately left short of full AST parsing.
import type { ParsedFile } from '../types';
import type { TsParser } from './tsParser';

export interface SvelteParseInput {
  relPath: string;
  content: string;
}

export interface SvelteParser {
  parse(input: SvelteParseInput): ParsedFile;
}

const SCRIPT_BLOCK_RE = /<\s*script\b[^>]*>([\s\S]*?)<\/\s*script\s*>/giu;

export function createSvelteParser(tsParser: TsParser): SvelteParser {
  return {
    parse(input) {
      const code = extractScripts(input.content);
      const parsed = tsParser.parse({
        relPath: input.relPath,
        content: code,
        language: 'ts',
      });
      return {
        ...parsed,
        loc: countLines(input.content),
        language: 'svelte',
      };
    },
  };
}

function extractScripts(content: string): string {
  const blocks: string[] = [];
  for (const m of content.matchAll(SCRIPT_BLOCK_RE)) {
    if (m[1]) blocks.push(m[1]);
  }
  return blocks.join('\n');
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') n++;
  return n;
}
