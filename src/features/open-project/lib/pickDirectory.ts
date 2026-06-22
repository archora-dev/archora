import type { FileSource } from '@/core/analyzer/fileSource';
import type { ProjectRef } from '@/core/analyzer/types';
import {
  loadProjectLocator,
  deleteProjectLocator,
  isTauri,
  tauriInvoke,
  tauriPickFolder,
  type ProjectLocator,
} from '@/shared/lib';
import { endStartupSpan, startStartupSpan } from '@/shared/lib/startupTiming';

export interface PickedProject {
  source: FileSource;
  name: string;
  locator: ProjectLocator;
}

export function draftProjectRef(picked: PickedProject): ProjectRef {
  return {
    id: projectIdFromRootPath(picked.source.rootPath),
    name: picked.name,
    rootPath: picked.source.rootPath,
    detectedFramework: 'generic',
  };
}

export class FsAccessUnavailableError extends Error {
  constructor() {
    super('File System Access API is not available in this browser');
    this.name = 'FsAccessUnavailableError';
  }
}

export class PickDirectoryCancelledError extends Error {
  constructor() {
    super('Directory pick was cancelled');
    this.name = 'PickDirectoryCancelledError';
  }
}

export class HandleNotFoundError extends Error {
  constructor() {
    super('Stored project handle not found');
    this.name = 'HandleNotFoundError';
  }
}

export class HandlePermissionDeniedError extends Error {
  constructor() {
    super('Permission to read the project directory was not granted');
    this.name = 'HandlePermissionDeniedError';
  }
}

export async function pickDirectory(): Promise<PickedProject> {
  startStartupSpan('pick directory flow');
  if (isTauri()) {
    const picked = await tauriPickFolder();
    if (!picked) throw new PickDirectoryCancelledError();
    startStartupSpan('tauri file source create');
    const { createTauriFileSource } = await import('@/core/analyzer/sources/tauriFileSource');
    const source = await createTauriFileSource({
      rootPath: picked.path,
      rootName: picked.name,
      invoke: tauriInvoke,
    });
    endStartupSpan('tauri file source create', picked.name);
    endStartupSpan('pick directory flow', picked.name);
    return {
      source,
      name: picked.name,
      locator: { kind: 'tauri', path: picked.path, name: picked.name },
    };
  }

  if (typeof window.showDirectoryPicker !== 'function') {
    throw new FsAccessUnavailableError();
  }
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'read' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new PickDirectoryCancelledError();
    }
    throw e;
  }
  const { createBrowserFsAccessFileSource } =
    await import('@/core/analyzer/sources/browserFsAccessFileSource');
  const source = await createBrowserFsAccessFileSource({ rootHandle: handle });
  endStartupSpan('pick directory flow', handle.name);
  return { source, name: handle.name, locator: { kind: 'fsAccess', handle } };
}

export async function reopenProject(projectId: string): Promise<PickedProject> {
  startStartupSpan('reopen project flow');
  startStartupSpan('project locator load');
  const locator = await loadProjectLocator(projectId);
  endStartupSpan('project locator load', projectId);
  if (!locator) throw new HandleNotFoundError();

  if (locator.kind === 'tauri') {
    startStartupSpan('tauri file source create');
    const { createTauriFileSource } = await import('@/core/analyzer/sources/tauriFileSource');
    const source = await createTauriFileSource({
      rootPath: locator.path,
      rootName: locator.name,
      invoke: tauriInvoke,
    });
    endStartupSpan('tauri file source create', locator.name);
    endStartupSpan('reopen project flow', locator.name);
    return { source, name: locator.name, locator };
  }

  if (typeof window.showDirectoryPicker !== 'function') {
    throw new FsAccessUnavailableError();
  }
  const handle = locator.handle;
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' };
  const current = handle.queryPermission ? await handle.queryPermission(opts) : 'prompt';
  if (current !== 'granted') {
    const next = handle.requestPermission ? await handle.requestPermission(opts) : 'denied';
    if (next !== 'granted') {
      await deleteProjectLocator(projectId).catch(() => undefined);
      throw new HandlePermissionDeniedError();
    }
  }
  const { createBrowserFsAccessFileSource } =
    await import('@/core/analyzer/sources/browserFsAccessFileSource');
  const source = await createBrowserFsAccessFileSource({ rootHandle: handle });
  endStartupSpan('reopen project flow', handle.name);
  return { source, name: handle.name, locator };
}

function projectIdFromRootPath(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
