import { afterEach, describe, expect, it, vi } from 'vitest';

const isTauri = vi.fn();
const loadProjectLocator = vi.fn();
const tauriInvoke = vi.fn();

vi.mock('@/shared/lib', () => ({
  isTauri: () => isTauri(),
  loadProjectLocator: (id: string) => loadProjectLocator(id),
  tauriInvoke: (cmd: string, args?: Record<string, unknown>) => tauriInvoke(cmd, args),
}));

import { DEFAULT_EDITOR_COMMAND, openInEditor, resolveAbsolutePath } from './openInEditor';

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveAbsolutePath', () => {
  it('joins root and relative path with a single separator', () => {
    expect(resolveAbsolutePath('/home/u/proj', 'src/a.ts')).toBe('/home/u/proj/src/a.ts');
  });

  it('collapses a trailing root slash and a leading relative slash', () => {
    expect(resolveAbsolutePath('/home/u/proj/', '/src/a.ts')).toBe('/home/u/proj/src/a.ts');
  });
});

describe('openInEditor', () => {
  it('reports unsupported in the browser without touching the locator', async () => {
    isTauri.mockReturnValue(false);
    const result = await openInEditor({ projectId: 'p', relativePath: 'src/a.ts' });
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
    expect(loadProjectLocator).not.toHaveBeenCalled();
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it('resolves the absolute path from the tauri locator and invokes the command', async () => {
    isTauri.mockReturnValue(true);
    loadProjectLocator.mockResolvedValue({ kind: 'tauri', path: '/repo/proj', name: 'proj' });
    tauriInvoke.mockResolvedValue(undefined);

    const result = await openInEditor({ projectId: 'p', relativePath: 'src/a.ts', line: 42 });

    expect(result).toEqual({ ok: true });
    expect(tauriInvoke).toHaveBeenCalledWith('open_in_editor', {
      command: DEFAULT_EDITOR_COMMAND,
      path: '/repo/proj/src/a.ts',
      line: 42,
    });
  });

  it('passes a custom editor command through', async () => {
    isTauri.mockReturnValue(true);
    loadProjectLocator.mockResolvedValue({ kind: 'tauri', path: '/repo', name: 'r' });
    tauriInvoke.mockResolvedValue(undefined);

    await openInEditor({ projectId: 'p', relativePath: 'a.ts', command: 'webstorm' });

    expect(tauriInvoke).toHaveBeenCalledWith('open_in_editor', {
      command: 'webstorm',
      path: '/repo/a.ts',
      line: undefined,
    });
  });

  it('reports no-root when the locator is missing or not a tauri path', async () => {
    isTauri.mockReturnValue(true);
    loadProjectLocator.mockResolvedValue(null);

    const result = await openInEditor({ projectId: 'p', relativePath: 'src/a.ts' });

    expect(result).toEqual({ ok: false, reason: 'no-root' });
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it('reports failed when the editor command rejects', async () => {
    isTauri.mockReturnValue(true);
    loadProjectLocator.mockResolvedValue({ kind: 'tauri', path: '/repo', name: 'r' });
    tauriInvoke.mockRejectedValue(new Error('not on PATH'));

    const result = await openInEditor({ projectId: 'p', relativePath: 'src/a.ts' });

    expect(result).toMatchObject({ ok: false, reason: 'failed', path: '/repo/src/a.ts' });
  });

  it('uses the configured editor command and reports it back on failure', async () => {
    isTauri.mockReturnValue(true);
    loadProjectLocator.mockResolvedValue({ kind: 'tauri', path: '/repo', name: 'r' });
    tauriInvoke.mockRejectedValue(new Error('nope'));

    const result = await openInEditor({
      projectId: 'p',
      relativePath: 'src/a.ts',
      command: 'cursor',
    });

    expect(tauriInvoke).toHaveBeenCalledWith(
      'open_in_editor',
      expect.objectContaining({ command: 'cursor' }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'failed', command: 'cursor' });
  });
});
