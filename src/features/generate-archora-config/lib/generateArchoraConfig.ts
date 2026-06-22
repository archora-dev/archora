import type { FileSource } from '@/core/analyzer/fileSource';
import { buildInitialArchoraConfigJson } from '@/core';
import { isTauri, tauriInvoke } from '@/shared/lib';

const CONFIG_FILENAMES = ['.archora.json', 'archora.json'] as const;

export class GenerateConfigError extends Error {
  readonly code: 'no-target' | 'write-failed';
  constructor(code: GenerateConfigError['code'], message: string) {
    super(message);
    this.name = 'GenerateConfigError';
    this.code = code;
  }
}

export interface StarterConfigPlan {
  /** Serialized `.archora.json` content tailored to the project. */
  json: string;
  /** Name of an existing config file, or null when none is present. */
  existingFile: string | null;
  /** Absolute path the config would be written to. */
  targetPath: string;
}

/**
 * Build a starter `.archora.json` for the project behind `source`, reusing the
 * same detection as `archora init`. Reads only the file listing and
 * `package.json`, so it is cheap enough to run on a button press. Reports
 * whether a config already exists so the caller can confirm an overwrite.
 */
export async function planStarterConfig(source: FileSource): Promise<StarterConfigPlan> {
  const files = await source.list();
  let packageJsonText: string | undefined;
  try {
    if (await source.exists('package.json')) {
      packageJsonText = await source.read('package.json');
    }
  } catch {
    /* package.json absent or unreadable — detection falls back to file shape */
  }

  const json = buildInitialArchoraConfigJson({
    files,
    ...(packageJsonText ? { packageJsonText } : {}),
  });

  let existingFile: string | null = null;
  for (const name of CONFIG_FILENAMES) {
    try {
      if (await source.exists(name)) {
        existingFile = name;
        break;
      }
    } catch {
      /* treat as absent */
    }
  }

  const targetRel = existingFile ?? CONFIG_FILENAMES[0];
  return { json, existingFile, targetPath: joinPath(source.rootPath, targetRel) };
}

/** Write a planned starter config to disk. Desktop-only. */
export async function writeStarterConfig(targetPath: string, json: string): Promise<void> {
  if (!isTauri()) {
    throw new GenerateConfigError('no-target', 'writing config requires the desktop app');
  }
  try {
    await tauriInvoke<void>('write_text_file', { path: targetPath, content: json });
  } catch (e) {
    throw new GenerateConfigError('write-failed', (e as Error).message);
  }
}

function joinPath(root: string, rel: string): string {
  const segments = rel.split(/[\\/]+/u).filter(Boolean);
  if (segments.some((s) => s === '..')) {
    throw new GenerateConfigError('no-target', `unsafe config path: ${rel}`);
  }
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const left = root.replace(/[\\/]+$/u, '');
  return `${left}${sep}${segments.join(sep)}`;
}
