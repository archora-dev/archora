import type { FolderExplorerItem } from '@/entities/architecture/model/types';
import type { ScanResult } from '@/core/analyzer/types';
import { moduleLabel } from '@/shared/lib';
import type { ArchTreeViewItemData } from '@archora/ui';

/**
 * A tree node carrying the risk counts aggregated from its subtree so the
 * surface can render a localized hint per folder. Extends the UI node shape;
 * `ArchTreeView` ignores the extra fields, the surface maps them into `label`.
 *
 * `kind` separates folders (which roll up descendant risk and expand by
 * default) from file leaves (which never expand and carry per-file risk flags).
 */
export interface FolderTreeNode extends ArchTreeViewItemData {
  kind: 'folder' | 'file';
  cycleCount: number;
  violationCount: number;
  inCycle: boolean;
  isHot: boolean;
  hasViolation: boolean;
  children?: FolderTreeNode[];
}

/** A single module placed under its folder, flagged with the risks it carries. */
export interface FileLeaf {
  id: string;
  inCycle: boolean;
  isHot: boolean;
  hasViolation: boolean;
}

/**
 * Derive the per-module risk flags the tree marks on file leaves. A module is
 * `inCycle` when its metrics say so or it appears in any reported cycle; `isHot`
 * when it is a hot zone; `hasViolation` when it is either side of a layer
 * violation.
 */
export function buildFileLeaves(scan: ScanResult): FileLeaf[] {
  const cycleMembers = new Set<string>();
  for (const cycle of scan.cycles) {
    for (const moduleId of cycle.modules) cycleMembers.add(moduleId);
  }

  const hotZones = new Set<string>(scan.hotZones);

  const violators = new Set<string>();
  for (const violation of scan.layerViolations) {
    violators.add(violation.from);
    violators.add(violation.to);
  }

  return scan.modules.map((module) => ({
    id: module.id,
    inCycle: scan.metrics[module.id]?.inCycle === true || cycleMembers.has(module.id),
    isHot: hotZones.has(module.id),
    hasViolation: violators.has(module.id),
  }));
}

export function buildFolderTree(
  items: FolderExplorerItem[],
  files: FileLeaf[] = [],
): FolderTreeNode[] {
  const nodes = new Map<string, FolderTreeNode>();
  const risk = new Map<string, { cycleCount: number; violationCount: number }>();
  for (const item of items) {
    risk.set(item.id, { cycleCount: item.cycleCount, violationCount: item.violationCount });
  }

  // Folder paths come from the explorer items; file paths come from the modules.
  // Synthesize every intermediate ancestor of both so the tree never has gaps.
  const folderPaths = new Set<string>();
  for (const item of items) {
    const segments = item.id.split('/');
    for (let len = 1; len <= segments.length; len++) {
      folderPaths.add(segments.slice(0, len).join('/'));
    }
  }
  for (const file of files) {
    const segments = file.id.split('/');
    // Every segment except the last is a folder ancestor of the file.
    for (let len = 1; len < segments.length; len++) {
      folderPaths.add(segments.slice(0, len).join('/'));
    }
  }

  for (const path of folderPaths) {
    const segments = path.split('/');
    const depth = segments.length - 1;
    const label = segments.at(-1) ?? path;
    const own = risk.get(path);
    nodes.set(path, {
      id: path,
      label,
      kind: 'folder',
      expanded: depth < 2,
      cycleCount: own?.cycleCount ?? 0,
      violationCount: own?.violationCount ?? 0,
      inCycle: false,
      isHot: false,
      hasViolation: false,
    });
  }

  for (const file of files) {
    const label = moduleLabel(file.id);
    nodes.set(file.id, {
      id: file.id,
      label,
      kind: 'file',
      cycleCount: 0,
      violationCount: 0,
      inCycle: file.inCycle,
      isHot: file.isHot,
      hasViolation: file.hasViolation,
    });
  }

  const roots: FolderTreeNode[] = [];
  for (const [path, node] of nodes) {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash > 0) {
      const parentPath = path.slice(0, lastSlash);
      const parent = nodes.get(parentPath);
      if (parent) {
        (parent.children ??= []).push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Folders sort before files at each level, then alphabetically by id, so the
  // tree reads as "subfolders, then the files in this folder".
  function compareNodes(a: FolderTreeNode, b: FolderTreeNode): number {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.id.localeCompare(b.id);
  }

  function sortChildren(node: FolderTreeNode): void {
    if (node.children) {
      node.children.sort(compareNodes);
      for (const child of node.children) {
        sortChildren(child);
      }
    }
  }

  // Roll the risk counts of every descendant up so a collapsed parent still
  // surfaces that something underneath needs attention. File leaves contribute
  // through their parent folder's own counts only (folders already aggregate
  // module-level cycles/violations), so leaves carry no counts of their own.
  function aggregate(node: FolderTreeNode): { cycleCount: number; violationCount: number } {
    let cycleCount = node.cycleCount;
    let violationCount = node.violationCount;
    for (const child of node.children ?? []) {
      const sub = aggregate(child);
      cycleCount += sub.cycleCount;
      violationCount += sub.violationCount;
    }
    node.cycleCount = cycleCount;
    node.violationCount = violationCount;
    return { cycleCount, violationCount };
  }

  roots.sort(compareNodes);
  for (const root of roots) {
    sortChildren(root);
    aggregate(root);
  }

  return roots;
}
