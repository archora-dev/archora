import { describe, expect, it } from 'vitest';
import { createInMemoryFileSource } from '@/core/analyzer/sources/inMemoryFileSource';
import { planStarterConfig } from '../lib/generateArchoraConfig';

describe('planStarterConfig', () => {
  it('builds a schema-referenced starter config and targets .archora.json', async () => {
    const source = createInMemoryFileSource('/proj', {
      'package.json': JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      'src/main.ts': 'export const main = 1;',
    });

    const plan = await planStarterConfig(source);

    expect(plan.existingFile).toBeNull();
    expect(plan.targetPath).toBe('/proj/.archora.json');
    const parsed = JSON.parse(plan.json) as { $schema: string };
    expect(parsed.$schema).toBe('https://docs.archora.dev/archora.schema.json');
  });

  it('reports an existing config so the caller can confirm an overwrite', async () => {
    const source = createInMemoryFileSource('/proj', {
      '.archora.json': '{ "entryPoints": ["src/main.ts"] }',
      'src/main.ts': 'export const main = 1;',
    });

    const plan = await planStarterConfig(source);

    expect(plan.existingFile).toBe('.archora.json');
    expect(plan.targetPath).toBe('/proj/.archora.json');
  });

  it('targets archora.json when that is the existing config name', async () => {
    const source = createInMemoryFileSource('/proj', {
      'archora.json': '{}',
      'src/main.ts': 'export const main = 1;',
    });

    const plan = await planStarterConfig(source);

    expect(plan.existingFile).toBe('archora.json');
    expect(plan.targetPath).toBe('/proj/archora.json');
  });
});
