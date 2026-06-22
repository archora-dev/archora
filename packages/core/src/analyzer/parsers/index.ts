import type { ModuleLanguage, ParsedFile } from '../types';
import type { Framework } from '../detect';
import type { DynamicLoaderConfig } from '../../config/frontScopeConfig';
import { createTsParser, type TsParser } from './tsParser';
import { createVueParser, type VueParser } from './vueParser';
import { createReactParser, type ReactParser } from './reactParser';
import { createSvelteParser, type SvelteParser } from './svelteParser';

export interface ParserRegistryOptions {
  framework?: Framework;
  dynamicLoaders?: DynamicLoaderConfig[];
}

export interface ParseFailure {
  reason: 'unsupported-extension';
}

export interface ParserRegistry {
  parse(input: { relPath: string; content: string }): ParsedFile | ParseFailure;
}

const TS_LANG_BY_EXT: Record<string, ModuleLanguage> = {
  ts: 'ts',
  tsx: 'ts',
  js: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
};

export function createParserRegistry(options: ParserRegistryOptions = {}): ParserRegistry {
  const tsParser: TsParser = createTsParser({
    ...(options.dynamicLoaders ? { dynamicLoaders: options.dynamicLoaders } : {}),
  });
  const vueParser: VueParser = createVueParser(tsParser);
  const reactParser: ReactParser = createReactParser(tsParser);
  const svelteParser: SvelteParser = createSvelteParser(tsParser);
  const isReactProject = options.framework === 'react' || options.framework === 'next';

  return {
    parse({ relPath, content }) {
      const ext = extOf(relPath);
      if (ext === 'vue') return vueParser.parse({ relPath, content });
      if (ext === 'svelte') return svelteParser.parse({ relPath, content });
      const lang = TS_LANG_BY_EXT[ext];
      if (lang) {
        if (isReactProject) return reactParser.parse({ relPath, content, language: lang });
        return tsParser.parse({ relPath, content, language: lang });
      }
      return { reason: 'unsupported-extension' };
    },
  };
}

export function isParseFailure(result: ParsedFile | ParseFailure): result is ParseFailure {
  return 'reason' in result;
}

function extOf(relPath: string): string {
  const i = relPath.lastIndexOf('.');
  return i === -1 ? '' : relPath.slice(i + 1).toLowerCase();
}
