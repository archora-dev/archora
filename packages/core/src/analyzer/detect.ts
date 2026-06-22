import type { FileSource } from './fileSource';

export type Framework = 'vue' | 'react' | 'svelte' | 'nuxt' | 'next' | 'generic' | 'unknown';

export interface DetectResult {
  framework: Framework;
  signals: Framework[];
}

const PRIORITY: Framework[] = ['nuxt', 'next', 'svelte', 'vue', 'react'];

export async function detectFramework(source: FileSource): Promise<DetectResult> {
  let deps: Record<string, string>;
  try {
    const raw = await source.read('package.json');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return { framework: 'generic', signals: [] };
  }

  const signals: Framework[] = [];
  if ('nuxt' in deps || 'nuxt3' in deps) signals.push('nuxt');
  if ('next' in deps) signals.push('next');
  if ('svelte' in deps) signals.push('svelte');
  if ('vue' in deps) signals.push('vue');
  if ('react' in deps) signals.push('react');

  const framework = PRIORITY.find((f) => signals.includes(f)) ?? 'generic';
  return { framework, signals };
}
