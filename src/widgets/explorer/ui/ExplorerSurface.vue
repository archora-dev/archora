<script setup lang="ts">
import { computed } from 'vue';
import { ArchTreeView } from '@archora/ui';
import type { ArchTreeViewItemData } from '@archora/ui';
import type { ScanResult } from '@/core/analyzer/types';
import { plural } from '@/shared/lib';
import { buildFolderExplorer } from '@/entities/architecture';
import { buildFileLeaves, buildFolderTree, type FolderTreeNode } from '../model/buildFolderTree';

const props = defineProps<{ scan: ScanResult; focusedModule?: string | null }>();

function folderHint(node: FolderTreeNode): string {
  const parts: string[] = [];
  if (node.cycleCount > 0)
    parts.push(plural(node.cycleCount, `${node.cycleCount} cycle`, `${node.cycleCount} cycles`));
  if (node.violationCount > 0)
    parts.push(
      plural(
        node.violationCount,
        `${node.violationCount} violation`,
        `${node.violationCount} violations`,
      ),
    );
  return parts.length ? `  ·  ${parts.join('  ')}` : '';
}

function fileMarker(node: FolderTreeNode): string {
  const parts: string[] = [];
  if (node.inCycle) parts.push('cycle');
  if (node.isHot) parts.push('hot');
  if (node.hasViolation) parts.push('violation');
  return parts.length ? `  ·  ${parts.join('  ')}` : '';
}

function decorate(node: FolderTreeNode): ArchTreeViewItemData {
  const suffix = node.kind === 'file' ? fileMarker(node) : folderHint(node);
  return {
    id: node.id,
    label: `${node.label}${suffix}`,
    ...(node.expanded !== undefined ? { expanded: node.expanded } : {}),
    ...(node.children ? { children: node.children.map(decorate) } : {}),
  };
}

const treeItems = computed<ArchTreeViewItemData[]>(() => {
  const folders = buildFolderExplorer(props.scan).items;
  const files = buildFileLeaves(props.scan);
  return buildFolderTree(folders, files).map(decorate);
});
</script>

<template>
  <section data-test="explorer-surface">
    <p class="surface-hint">
      Browse the folder tree. Click a folder to expand it down to the files; markers flag the files
      in cycles, hot zones or layer violations.
    </p>
    <ArchTreeView :items="treeItems" />
  </section>
</template>

<style scoped>
.surface-hint {
  margin: 0 0 var(--arch-space-3, 0.75rem);
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--arch-color-fg-muted);
}
</style>
