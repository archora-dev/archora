import { isTauri } from './tauriRuntime';

export type ProjectLocator =
  | { kind: 'fsAccess'; handle: FileSystemDirectoryHandle }
  | { kind: 'tauri'; path: string; name: string };

const DB_NAME = 'archora';
const DB_VERSION = 1;
const STORE = 'project-handles';

const TAURI_STORE_FILE = 'recent-projects.json';
const TAURI_STORE_PREFIX = 'project:';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface TauriProjectRecord {
  path: string;
  name: string;
}

async function tauriStore() {
  const { load } = await import('@tauri-apps/plugin-store');
  return load(TAURI_STORE_FILE, { defaults: {}, autoSave: true });
}

export async function saveProjectLocator(id: string, locator: ProjectLocator): Promise<void> {
  if (locator.kind === 'fsAccess') {
    await withStore('readwrite', (store) => store.put(locator.handle, id));
    return;
  }
  const store = await tauriStore();
  const record: TauriProjectRecord = { path: locator.path, name: locator.name };
  await store.set(`${TAURI_STORE_PREFIX}${id}`, record);
}

export async function loadProjectLocator(id: string): Promise<ProjectLocator | null> {
  if (isTauri()) {
    const store = await tauriStore();
    const rec = (await store.get(`${TAURI_STORE_PREFIX}${id}`)) as TauriProjectRecord | undefined;
    if (!rec) return null;
    return { kind: 'tauri', path: rec.path, name: rec.name };
  }
  const result = await withStore<unknown>('readonly', (store) => store.get(id));
  if (!result) return null;
  return { kind: 'fsAccess', handle: result as FileSystemDirectoryHandle };
}

export async function deleteProjectLocator(id: string): Promise<void> {
  if (isTauri()) {
    const store = await tauriStore();
    await store.delete(`${TAURI_STORE_PREFIX}${id}`);
    return;
  }
  await withStore('readwrite', (store) => store.delete(id));
}

/** @deprecated use saveProjectLocator */
export async function saveProjectHandle(
  id: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  return saveProjectLocator(id, { kind: 'fsAccess', handle });
}

/** @deprecated use loadProjectLocator */
export async function loadProjectHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  const loc = await loadProjectLocator(id);
  if (!loc || loc.kind !== 'fsAccess') return null;
  return loc.handle;
}

/** @deprecated use deleteProjectLocator */
export async function deleteProjectHandle(id: string): Promise<void> {
  return deleteProjectLocator(id);
}
