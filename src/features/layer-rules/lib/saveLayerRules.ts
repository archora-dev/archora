import type { LayerOverrides } from '@/core/analyzer/layers';
import { isTauri, tauriInvoke } from '@/shared/lib';

export class SaveLayerRulesError extends Error {
  readonly code: 'read-failed' | 'parse-failed' | 'write-failed' | 'no-target';
  constructor(code: SaveLayerRulesError['code'], message: string) {
    super(message);
    this.name = 'SaveLayerRulesError';
    this.code = code;
  }
}

const CONFIG_FILENAMES = ['.archora.json', 'archora.json'] as const;

interface SaveInput {
  rootPath: string;
  overrides: LayerOverrides;
}

interface SaveOutput {
  /** Absolute path of the file that was written. */
  path: string;
  /** True when the write created the file rather than updating it. */
  created: boolean;
}

/**
 * Merge `layerOverrides` into the project's `.archora.json` (or
 * `archora.json`) without disturbing other config keys. If neither file
 * exists, creates `.archora.json` with just the overrides.
 *
 * Tauri-only - in browser builds the caller should use `serializeForBrowser`
 * to render a "save as" download.
 */
export async function saveLayerRulesToDisk(input: SaveInput): Promise<SaveOutput> {
  if (!isTauri()) {
    throw new SaveLayerRulesError('no-target', 'writing config requires the Tauri runtime');
  }
  const { rootPath, overrides } = input;
  const sep = detectSep(rootPath);

  // Find an existing config file; default to the dotfile if neither exists.
  let targetRel: string | null = null;
  for (const name of CONFIG_FILENAMES) {
    const exists = await tauriInvoke<boolean>('file_exists', {
      root: rootPath,
      relative: name,
    }).catch(() => false);
    if (exists) {
      targetRel = name;
      break;
    }
  }
  const created = targetRel === null;
  if (!targetRel) targetRel = CONFIG_FILENAMES[0];
  const path = joinPath(rootPath, targetRel, sep);

  let existing: Record<string, unknown> = {};
  if (!created) {
    try {
      const raw = await tauriInvoke<string>('read_file', {
        root: rootPath,
        relative: targetRel,
      });
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch (e) {
      throw new SaveLayerRulesError('parse-failed', (e as Error).message);
    }
  }

  const next: Record<string, unknown> = { ...existing };
  if (Object.keys(overrides).length === 0) {
    delete next['layerOverrides'];
  } else {
    next['layerOverrides'] = overrides;
  }
  const content = JSON.stringify(next, null, 2) + '\n';
  try {
    await tauriInvoke<void>('write_text_file', { path, content });
  } catch (e) {
    throw new SaveLayerRulesError('write-failed', (e as Error).message);
  }
  return { path, created };
}

/**
 * Browser fallback: just produce the JSON snippet so the user can paste it.
 * Returns the same shape the desktop version would write.
 */
export function serializeForBrowser(overrides: LayerOverrides): string {
  if (Object.keys(overrides).length === 0) return '{}\n';
  return JSON.stringify({ layerOverrides: overrides }, null, 2) + '\n';
}

function detectSep(rootPath: string): '/' | '\\' {
  return rootPath.includes('\\') && !rootPath.includes('/') ? '\\' : '/';
}

function joinPath(a: string, b: string, sep: '/' | '\\'): string {
  const left = a.replace(/[\\/]+$/u, '');
  const right = b.replace(/^[\\/]+/u, '').replace(/[\\/]/gu, sep);
  return `${left}${sep}${right}`;
}
