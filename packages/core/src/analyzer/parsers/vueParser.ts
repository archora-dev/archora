import { parse as parseSfc } from '@vue/compiler-sfc';
import type { ParsedFile } from '../types';
import type { TsParser } from './tsParser';

export interface VueParseInput {
  relPath: string;
  content: string;
}

export interface VueParser {
  parse(input: VueParseInput): ParsedFile;
}

const VUE_BUILTIN_TAGS: ReadonlySet<string> = new Set([
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Suspense',
  'Teleport',
  'Component',
  'Slot',
  'RouterView',
  'RouterLink',
  'NuxtLink',
  'NuxtPage',
  'NuxtLayout',
  'ClientOnly',
]);

export function createVueParser(tsParser: TsParser): VueParser {
  return {
    parse(input: VueParseInput): ParsedFile {
      const { descriptor } = parseSfc(input.content, { filename: input.relPath });
      const setup = descriptor.scriptSetup;
      const script = descriptor.script;
      const code = `${setup?.content ?? ''}\n${script?.content ?? ''}`;
      const parsed = tsParser.parse({
        relPath: input.relPath,
        content: code,
        language: 'vue',
      });

      const templateRefs = descriptor.template?.ast
        ? extractTemplateComponentTags(descriptor.template.ast as unknown as TemplateNodeLike)
        : [];

      return {
        ...parsed,
        loc: countLines(input.content),
        language: 'vue',
        ...(templateRefs.length > 0 ? { templateRefs } : {}),
      };
    },
  };
}

function extractTemplateComponentTags(root: TemplateNodeLike): string[] {
  const found = new Set<string>();
  visit(root.children);
  return [...found];

  function visit(children: ReadonlyArray<unknown> | undefined): void {
    if (!children) return;
    for (const child of children) {
      if (!isElementNode(child)) continue;
      if (child.type === 1 && child.tagType === 1 && typeof child.tag === 'string') {
        const name = normalizeTag(child.tag);
        if (name && !VUE_BUILTIN_TAGS.has(name)) found.add(name);
      }
      visit(child.children);
    }
  }
}

interface TemplateNodeLike {
  children?: ReadonlyArray<unknown>;
}

interface ElementNodeLike {
  type: number;
  tag?: string;
  tagType?: number;
  children?: ReadonlyArray<unknown>;
}

function isElementNode(node: unknown): node is ElementNodeLike {
  return (
    typeof node === 'object' &&
    node !== null &&
    typeof (node as { type?: unknown }).type === 'number'
  );
}

function normalizeTag(tag: string): string | null {
  if (tag.length === 0) return null;
  if (!tag.includes('-')) return tag;
  return tag
    .split('-')
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') n++;
  return n;
}
