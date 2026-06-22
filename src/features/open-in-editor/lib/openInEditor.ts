import { isTauri, loadProjectLocator, tauriInvoke } from '@/shared/lib';

/** Editor invoked when none is configured. Overridable in Settings. */
export const DEFAULT_EDITOR_COMMAND = 'code';

export type OpenInEditorResult =
  | { ok: true }
  /** `path` is the absolute path that was attempted, so the caller can offer a copy-path fallback. */
  | { ok: false; reason: 'unsupported' | 'no-root' | 'failed'; path?: string; command?: string };

export interface OpenInEditorInput {
  /** Scan project id, used to resolve the project root from its locator. */
  projectId: string;
  /** Module id relative to the project root (e.g. `src/widgets/x/ui/X.vue`). */
  relativePath: string;
  /** 1-based line to jump to. Omitted opens the file at the top. */
  line?: number;
  /** Editor CLI command. Defaults to VS Code. */
  command?: string;
}

/**
 * Join a project root and a module-relative path into an absolute path the
 * editor command understands. Normalizes the separator so a trailing slash on
 * the root or a leading slash on the relative path never doubles up.
 */
export function resolveAbsolutePath(root: string, relativePath: string): string {
  const left = root.replace(/[/\\]+$/, '');
  const right = relativePath.replace(/^[/\\]+/, '');
  return `${left}/${right}`;
}

/**
 * Open a module in the user's editor. Resolves the absolute path from the
 * project locator, then invokes the Tauri `open_in_editor` command. Never
 * throws: failures are returned as a tagged reason so the caller can localize a
 * toast. In the browser there is no editor bridge, so it reports `unsupported`.
 */
export async function openInEditor(input: OpenInEditorInput): Promise<OpenInEditorResult> {
  if (!isTauri()) return { ok: false, reason: 'unsupported' };

  let root: string | null = null;
  try {
    const locator = await loadProjectLocator(input.projectId);
    if (locator && locator.kind === 'tauri') root = locator.path;
  } catch {
    root = null;
  }
  if (!root) return { ok: false, reason: 'no-root' };

  const path = resolveAbsolutePath(root, input.relativePath);
  const command = input.command?.trim() || DEFAULT_EDITOR_COMMAND;
  try {
    await tauriInvoke('open_in_editor', { command, path, line: input.line });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed', path, command };
  }
}
