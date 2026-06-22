import type { FolderExplorerItem } from './types';

export type ExplorerSelectionMatch = 'exact-path' | 'folder' | 'parent-folder';

export interface ExplorerSelectionTarget {
  item: FolderExplorerItem;
  match: ExplorerSelectionMatch;
}

export function resolveExplorerSelectionTarget(
  items: readonly FolderExplorerItem[],
  target: string,
): ExplorerSelectionTarget | null {
  const normalized = normalizePath(target);
  if (!normalized) return null;

  const exactModule = items.find((item) =>
    item.topFiles.some((file) => normalizePath(file.id) === normalized),
  );
  if (exactModule) return { item: exactModule, match: 'exact-path' };

  const exactFolder = items.find((item) => normalizePath(item.id) === normalized);
  if (exactFolder) return { item: exactFolder, match: 'folder' };

  const folder = folderOf(normalized);
  const folderMatch = items.find((item) => normalizePath(item.id) === folder);
  if (folderMatch) return { item: folderMatch, match: 'folder' };

  const parent = [...items]
    .filter((item) => isParentFolder(normalized, normalizePath(item.id)))
    .sort((a, b) => b.id.length - a.id.length)[0];

  return parent ? { item: parent, match: 'parent-folder' } : null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/u, '').trim();
}

function folderOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function isParentFolder(path: string, candidate: string): boolean {
  return candidate.length > 0 && path.startsWith(`${candidate}/`);
}
