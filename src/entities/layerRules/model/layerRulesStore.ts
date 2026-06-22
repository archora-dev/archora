import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { LayerOverrides } from '@/core/analyzer/layers';

/**
 * Per-project working copy of `layerOverrides`. The "saved" snapshot mirrors
 * what is on disk in `.archora.json` (or what the analyzer was last run
 * with); the "draft" is the user's in-progress editing state and may include
 * empty rows. Live preview renders against the draft.
 *
 * We deliberately keep this in-memory only - the source of truth is the
 * file on disk. Persisting drafts to localStorage would invite the classic
 * "I edited the file, but the editor stomped on it" footgun.
 */
export interface LayerRuleRow {
  /** Stable ID for v-for keys. Independent of pattern (which can be edited). */
  rowId: string;
  pattern: string;
  layer: string;
}

interface ProjectState {
  saved: LayerRuleRow[];
  draft: LayerRuleRow[];
}

let nextRowId = 1;
function makeRowId(): string {
  return `r${nextRowId++}`;
}

function fromOverrides(overrides: LayerOverrides | undefined): LayerRuleRow[] {
  if (!overrides) return [];
  return Object.entries(overrides).map(([pattern, layer]) => ({
    rowId: makeRowId(),
    pattern,
    layer,
  }));
}

function toOverrides(rows: LayerRuleRow[]): LayerOverrides {
  // last write wins on duplicate patterns; empty rows are dropped silently.
  const out: LayerOverrides = {};
  for (const r of rows) {
    if (!r.pattern.trim()) continue;
    out[r.pattern] = r.layer;
  }
  return out;
}

export const useLayerRulesStore = defineStore('layerRules', () => {
  const byProject = ref<Record<string, ProjectState>>({});

  function ensure(projectId: string): ProjectState {
    let s = byProject.value[projectId];
    if (!s) {
      s = { saved: [], draft: [] };
      byProject.value[projectId] = s;
    }
    return s;
  }

  /** Load saved snapshot from analyzer config; resets draft to a copy. */
  function load(projectId: string, overrides: LayerOverrides | undefined): void {
    const saved = fromOverrides(overrides);
    byProject.value[projectId] = {
      saved,
      draft: saved.map((r) => ({ ...r, rowId: makeRowId() })),
    };
  }

  function draftRows(projectId: string): LayerRuleRow[] {
    return ensure(projectId).draft;
  }

  function setRows(projectId: string, rows: LayerRuleRow[]): void {
    ensure(projectId).draft = rows;
  }

  function addRow(projectId: string): LayerRuleRow {
    const row: LayerRuleRow = { rowId: makeRowId(), pattern: '', layer: 'shared' };
    ensure(projectId).draft.push(row);
    return row;
  }

  function removeRow(projectId: string, rowId: string): void {
    const s = ensure(projectId);
    s.draft = s.draft.filter((r) => r.rowId !== rowId);
  }

  function updateRow(
    projectId: string,
    rowId: string,
    patch: Partial<Pick<LayerRuleRow, 'pattern' | 'layer'>>,
  ): void {
    const s = ensure(projectId);
    s.draft = s.draft.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r));
  }

  /** Discard the draft, restoring whatever was last loaded. */
  function reset(projectId: string): void {
    const s = ensure(projectId);
    s.draft = s.saved.map((r) => ({ ...r, rowId: makeRowId() }));
  }

  /** Drop both draft and saved overrides ("Reset to detected"). */
  function clear(projectId: string): void {
    byProject.value[projectId] = { saved: [], draft: [] };
  }

  /** Mark current draft as saved (after a successful disk write). */
  function commit(projectId: string): void {
    const s = ensure(projectId);
    s.saved = s.draft.map((r) => ({ ...r }));
  }

  function draftOverrides(projectId: string): LayerOverrides {
    return toOverrides(ensure(projectId).draft);
  }

  function isDirty(projectId: string): boolean {
    const s = ensure(projectId);
    if (s.saved.length !== s.draft.length) return true;
    for (let i = 0; i < s.saved.length; i++) {
      const a = s.saved[i]!;
      const b = s.draft[i]!;
      if (a.pattern !== b.pattern || a.layer !== b.layer) return true;
    }
    return false;
  }

  // expose simple computed wrappers for component use
  const allProjects = computed(() => byProject.value);

  return {
    byProject: allProjects,
    load,
    draftRows,
    setRows,
    addRow,
    removeRow,
    updateRow,
    reset,
    clear,
    commit,
    draftOverrides,
    isDirty,
  };
});

// re-export pure helpers for tests
export { fromOverrides, toOverrides };
