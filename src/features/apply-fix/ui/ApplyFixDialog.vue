<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Modal, Spinner, useToast } from '@/shared/ui';
import { isTauri, loadProjectLocator } from '@/shared/lib';
import { useScanStore } from '@/entities/scan';
import { useProjectStore } from '@/entities/project';
import { reopenProject } from '@/features/open-project';
import { runScanFlow } from '@/features/scan-project';
import type { Recommendation, ScanResult } from '@/core/analyzer/types';
import {
  ApplyFixError,
  isScanStale,
  prepareTypeOnlyFix,
  writeTypeOnlyFix,
  type PreparedFix,
} from '../lib/applyFix';
import { buildUnifiedPatch, diffLines, withContext, type DiffOp } from '../lib/lineDiff';

const props = defineProps<{ open: boolean; rec: Recommendation | null }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; applied: [] }>();

const toast = useToast();
const scanStore = useScanStore();
const projectStore = useProjectStore();

const loading = ref(false);
const applying = ref(false);
const error = ref<string | null>(null);
const prepared = ref<PreparedFix | null>(null);

const isTauriEnv = isTauri();

const diffRows = computed(() => {
  if (!prepared.value) return [];
  return withContext(diffLines(prepared.value.before, prepared.value.after), 3);
});

const patchText = computed(() => {
  if (!prepared.value) return '';
  return buildUnifiedPatch(prepared.value.filePath, prepared.value.before, prepared.value.after);
});

watch(
  () => [props.open, props.rec?.id] as const,
  async (curr, prev) => {
    const open = curr[0];
    const recId = curr[1];
    const prevOpen = prev?.[0] ?? false;
    if (!open || !props.rec) {
      if (prevOpen) {
        prepared.value = null;
        error.value = null;
      }
      return;
    }
    if (recId !== prepared.value?.rec.id) {
      await load();
    }
  },
  { immediate: true },
);

async function load(): Promise<void> {
  if (!props.rec || !scanStore.result) return;
  loading.value = true;
  error.value = null;
  prepared.value = null;
  try {
    const projectId = scanStore.result.project.id;
    const picked = await reopenProject(projectId);
    const p = await prepareTypeOnlyFix({
      rec: props.rec,
      scan: scanStore.result,
      source: picked.source,
    });
    prepared.value = p;
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    loading.value = false;
  }
}

async function apply(rescan: boolean): Promise<void> {
  if (!prepared.value || !scanStore.result || !projectStore.current) return;
  applying.value = true;
  error.value = null;
  try {
    if (isScanStale(scanStore.result)) {
      throw new ApplyFixError(
        'scan-stale',
        'Scan is older than 5 minutes — re-scan the project first',
      );
    }
    // `projectStore.current.rootPath` is the display label in Tauri (just the
    // directory name like "sample-type-only"), not an absolute path. The real
    // path lives in the persisted locator. Same fix pattern as LayerRulesPage
    // / useProjectWatcher.
    const loc = await loadProjectLocator(projectStore.current.id);
    const absRoot = loc?.kind === 'tauri' ? loc.path : projectStore.current.rootPath;
    // Capture the recommendation id BEFORE close(): the dialog watcher nulls
    // out `prepared.value` as soon as `open` flips to false, which would crash
    // the post-rescan check below with «null is not an object».
    const recId = prepared.value.rec.id;
    await writeTypeOnlyFix({
      prepared: prepared.value,
      rootPath: absRoot,
    });
    toast.success('Import rewritten as type-only');
    emit('applied');
    close();
    if (rescan) {
      const projectId = scanStore.result.project.id;
      const picked = await reopenProject(projectId);
      // file watcher (when active) will also catch this; explicit rescan
      // gives the user immediate feedback.
      await runScanFlow({ source: picked.source, locator: picked.locator });
      const after = useScanStore().result as ScanResult | null;
      if (after && noLongerHasInsight(after, recId)) {
        toast.success('Insight cleared after rescan');
      }
    }
  } catch (e) {
    error.value = errMsg(e);
    toast.danger('Failed to apply fix', errMsg(e));
  } finally {
    applying.value = false;
  }
}

function noLongerHasInsight(scan: ScanResult, recId: string): boolean {
  return !scan.recommendations.some((r) => r.id === recId);
}

async function copyPatch(): Promise<void> {
  if (!patchText.value) return;
  try {
    await navigator.clipboard.writeText(patchText.value);
    toast.success('Patch copied to clipboard');
  } catch (e) {
    toast.danger('Failed to copy patch', errMsg(e));
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

function close(): void {
  emit('update:open', false);
}

// Tailwind 3.4 + colors-as-`var(--color-…)`-with-hex breaks slash-opacity
// (`bg-danger/10` falls through to invalid CSS), so the diff bg never renders.
// Use explicit utility classes wired to `color-mix()` in scoped styles below.
function rowClass(op: DiffOp, side: 'left' | 'right'): string {
  if (op === 'eq') return 'text-text-muted';
  if (op === 'del') return side === 'left' ? 'diff-del text-text' : 'text-text-subtle';
  return side === 'right' ? 'diff-add text-text' : 'text-text-subtle';
}
</script>

<template>
  <Modal
    :open="open"
    size="xl"
    title="Rewrite as a type-only import"
    @update:open="(v) => emit('update:open', v)"
  >
    <div v-if="loading" class="flex items-center gap-2 py-6 text-text-muted">
      <Spinner /> Preparing diff…
    </div>
    <div v-else-if="error" class="diff-error rounded-md border p-3 text-danger">
      {{ error }}
    </div>
    <div v-else-if="prepared" class="flex min-h-0 flex-col gap-2">
      <div class="flex items-center gap-2 text-xs text-text-muted">
        <span class="font-mono">{{ prepared.filePath }}</span>
      </div>
      <div
        class="grid min-h-0 grid-cols-2 overflow-hidden rounded-md border border-border font-mono text-[12px]"
      >
        <div class="border-r border-border bg-surface-2/40">
          <div class="border-b border-border px-2 py-1 text-text-subtle">Before</div>
          <div class="max-h-[50vh] overflow-auto">
            <div
              v-for="(row, idx) in diffRows"
              :key="`L${idx}`"
              :class="rowClass(row.op, 'left')"
              class="flex gap-2 whitespace-pre px-2 py-px"
            >
              <span class="w-8 shrink-0 text-right text-text-subtle">{{ row.leftNo ?? '' }}</span>
              <span>{{ row.left ?? '' }}</span>
            </div>
          </div>
        </div>
        <div class="bg-surface-2/40">
          <div class="border-b border-border px-2 py-1 text-text-subtle">After</div>
          <div class="max-h-[50vh] overflow-auto">
            <div
              v-for="(row, idx) in diffRows"
              :key="`R${idx}`"
              :class="rowClass(row.op, 'right')"
              class="flex gap-2 whitespace-pre px-2 py-px"
            >
              <span class="w-8 shrink-0 text-right text-text-subtle">{{ row.rightNo ?? '' }}</span>
              <span>{{ row.right ?? '' }}</span>
            </div>
          </div>
        </div>
      </div>
      <p v-if="!isTauriEnv" class="text-xs text-text-muted">
        Only "Copy patch" is available in the browser — install the desktop build to write changes.
      </p>
    </div>

    <template #footer>
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="ghost" :disabled="!prepared" @click="copyPatch"> Copy patch </Button>
      <Button
        :disabled="!prepared || !isTauriEnv || applying"
        :loading="applying"
        @click="apply(false)"
      >
        Apply
      </Button>
      <Button
        variant="primary"
        :disabled="!prepared || !isTauriEnv || applying"
        :loading="applying"
        @click="apply(true)"
      >
        Apply and re-scan
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.diff-del {
  background-color: color-mix(in srgb, var(--color-danger) 14%, transparent);
}
.diff-add {
  background-color: color-mix(in srgb, var(--color-success) 16%, transparent);
}
.diff-error {
  background-color: color-mix(in srgb, var(--color-danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-danger) 40%, transparent);
}
</style>
