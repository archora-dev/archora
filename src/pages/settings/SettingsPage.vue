<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  AlertTriangle,
  Copy,
  FileCode2,
  Palette,
  Plus,
  RefreshCcw,
  RotateCcw,
  X,
} from 'lucide-vue-next';
import { compileGlob } from '@/core/analyzer/discover';
import { useSettingsStore } from '@/entities/settings';
import { useScanStore } from '@/entities/scan';
import {
  Button,
  Card,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Spinner,
  Switch,
  useToast,
} from '@/shared/ui';
import { LicenseCard } from '@/features/license-activation';
import { useAnalysisSettingsDirty } from '@/features/scan-project';
import { isTauri, useTheme, type ThemeMode } from '@/shared/lib';

const settingsStore = useSettingsStore();
const toast = useToast();

const watcherAvailable = isTauri();
const scanStore = useScanStore();
const resetOpen = ref(false);
const generatedPathInput = ref('');

const { mode: themeMode, setMode: setThemeMode } = useTheme();

const { dirty: settingsDirty, rescanning, rescan } = useAnalysisSettingsDirty();

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const BROAD_PATTERN_PERCENT = 50;

const suggestedGeneratedPaths = [
  '**/openapi/**',
  '**/generated/**',
  '**/__generated__/**',
  '**/*.generated.ts',
];

const generatedPaths = computed(() => settingsStore.settings.analysis.generatedPaths);
const generatedConfigSnippet = computed(() =>
  JSON.stringify(
    {
      analysis: {
        generated: {
          mode: 'classifyAsGenerated',
          paths: generatedPaths.value,
        },
      },
    },
    null,
    2,
  ),
);

interface PatternPreview {
  pattern: string;
  matched: number;
  totalModules: number;
  broad: boolean;
}

const moduleIds = computed<string[]>(() =>
  scanStore.result ? scanStore.result.modules.map((m) => m.id) : [],
);

const patternPreviews = computed<PatternPreview[]>(() => {
  const ids = moduleIds.value;
  if (ids.length === 0) {
    return generatedPaths.value.map((pattern) => ({
      pattern,
      matched: 0,
      totalModules: 0,
      broad: false,
    }));
  }
  return generatedPaths.value.map((pattern) => {
    let matched = 0;
    try {
      const re = compileGlob(pattern);
      for (const id of ids) if (re.test(id)) matched++;
    } catch {
      // Invalid glob: keep the preview non-blocking.
    }
    return {
      pattern,
      matched,
      totalModules: ids.length,
      broad: matched / ids.length > BROAD_PATTERN_PERCENT / 100,
    };
  });
});

const previewByPattern = computed(() => {
  const map = new Map<string, PatternPreview>();
  for (const preview of patternPreviews.value) map.set(preview.pattern, preview);
  return map;
});

function normalizeGeneratedPath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
}

function setGeneratedPaths(paths: string[]): void {
  settingsStore.setAnalysis('generatedPaths', paths);
}

function addGeneratedPath(input = generatedPathInput.value): void {
  const path = normalizeGeneratedPath(input);
  if (!path) {
    toast.warning('Enter a glob pattern');
    return;
  }

  if (generatedPaths.value.includes(path)) {
    toast.warning('This pattern is already added');
    return;
  }

  setGeneratedPaths([...generatedPaths.value, path]);
  generatedPathInput.value = '';
  toast.success('Pattern added');
}

function removeGeneratedPath(path: string): void {
  setGeneratedPaths(generatedPaths.value.filter((item) => item !== path));
}

async function copyGeneratedSnippet(): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(generatedConfigSnippet.value);
    toast.success('Config snippet copied');
  } catch {
    toast.danger('Failed to copy snippet');
  }
}

function onRescan(): void {
  void rescan();
}

function confirmReset(): void {
  settingsStore.reset();
  resetOpen.value = false;
}
</script>

<template>
  <section class="settings-page min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-8">
      <header class="flex flex-col gap-2">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Workspace</p>
        <div>
          <h1 class="text-2xl font-semibold text-text">Settings</h1>
          <p class="mt-1 max-w-3xl text-sm text-text-muted">
            Global interface settings and local workflow preferences. Project analysis rules stay
            with the project so scan results remain reproducible.
          </p>
        </div>
      </header>

      <div class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div class="grid min-w-0 content-start gap-4">
          <!-- Appearance -->
          <Card>
            <div class="flex items-start gap-3">
              <span class="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
                <Palette class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtle">
                  Appearance
                </h2>
                <p class="mt-1 text-sm text-text-muted">
                  These preferences affect only your local Archora interface.
                </p>
              </div>
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-text-subtle">Theme</p>
                <SegmentedControl
                  :model-value="themeMode"
                  :options="themeOptions"
                  data-test="theme-control"
                  @update:model-value="setThemeMode"
                />
              </div>
            </div>
          </Card>

          <!-- Analysis: excluded paths -->
          <Card>
            <div class="flex items-start gap-3">
              <span class="rounded-md border border-info/30 bg-info/10 p-2 text-info">
                <FileCode2 class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtle">
                  Analysis hygiene
                </h2>
                <p class="mt-1 text-sm text-text-muted">
                  Paths excluded from analysis. Generated code, vendor files, or anything you don't
                  want scored stays out of discovery so it can't skew findings.
                </p>
              </div>
            </div>

            <div
              v-if="settingsDirty"
              class="mt-4 flex items-center gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
              data-test="settings-dirty-banner"
            >
              <RefreshCcw class="size-4 shrink-0" />
              <span class="min-w-0 flex-1 text-text-muted">
                Excluded paths were edited since the last scan. Re-scan to apply them to findings.
              </span>
              <Button
                size="sm"
                variant="primary"
                :disabled="rescanning"
                data-test="settings-dirty-rescan"
                @click="onRescan"
              >
                <Spinner v-if="rescanning" class="size-3.5" />
                <RefreshCcw v-else class="size-3.5" />
                Re-scan now
              </Button>
            </div>

            <div class="mt-5 rounded-md border border-border bg-surface/60 p-4">
              <div class="min-w-0">
                <h3 class="text-base font-semibold text-text">Excluded paths</h3>
                <p class="mt-1 max-w-2xl text-sm text-text-muted">
                  Add glob patterns for files to skip during analysis: schema-generated clients,
                  vendored code, or directories you don't want scored. Matching modules are dropped
                  from discovery on the next scan.
                </p>
                <p class="mt-2 max-w-2xl text-xs text-text-subtle">
                  `dist`, `build`, caches and build artifacts should already sit outside the scan
                  root. Use this list for source you want to keep in the tree but out of findings.
                </p>
                <p
                  class="mt-2 flex items-start gap-1.5 max-w-2xl text-xs font-medium text-info"
                  data-test="apply-note"
                >
                  <RefreshCcw class="mt-0.5 size-3 shrink-0" />
                  <span
                    >Changes apply on the next scan. Re-scan the open project to update
                    findings.</span
                  >
                </p>
              </div>

              <form
                class="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
                data-test="generated-path-form"
                @submit.prevent="addGeneratedPath()"
              >
                <label class="sr-only" for="generated-path-input"> Excluded path pattern </label>
                <Input
                  id="generated-path-input"
                  v-model="generatedPathInput"
                  data-test="generated-path-input"
                  placeholder="Example: **/openapi/**"
                />
                <Button type="submit" variant="primary" data-test="generated-path-add">
                  <Plus class="size-3.5" />
                  Add
                </Button>
              </form>

              <div class="mt-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                  Current patterns
                </p>
                <div v-if="generatedPaths.length" class="mt-2 flex flex-col gap-2">
                  <div
                    v-for="path in generatedPaths"
                    :key="path"
                    class="flex flex-col gap-1 rounded-md border border-border bg-surface px-2 py-1.5"
                    data-test="generated-path-item"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <code class="min-w-0 flex-1 truncate font-mono text-xs text-text">{{
                        path
                      }}</code>
                      <span
                        v-if="moduleIds.length > 0"
                        class="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-muted"
                        data-test="generated-path-preview"
                      >
                        {{
                          `${previewByPattern.get(path)?.matched ?? 0} modules matched in current scan`
                        }}
                      </span>
                      <IconButton
                        :icon="X"
                        size="sm"
                        variant="ghost"
                        data-test="generated-path-remove"
                        :label="`Remove ${path}`"
                        @click="removeGeneratedPath(path)"
                      />
                    </div>
                    <p
                      v-if="previewByPattern.get(path)?.broad"
                      class="flex items-start gap-1.5 text-[11px] text-warning"
                      data-test="generated-path-warning"
                    >
                      <AlertTriangle class="mt-0.5 size-3 shrink-0" />
                      <span>{{
                        `Broad pattern: matches over ${BROAD_PATTERN_PERCENT}% of modules. Narrow it down or it will hide real findings.`
                      }}</span>
                    </p>
                  </div>
                  <p
                    v-if="moduleIds.length === 0"
                    class="text-[11px] italic text-text-subtle"
                    data-test="generated-path-no-scan"
                  >
                    Run a scan to see how many modules each pattern matches.
                  </p>
                </div>
                <p v-else class="mt-2 text-sm text-text-muted" data-test="generated-path-empty">
                  No patterns added yet.
                </p>
              </div>

              <div class="mt-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                  Suggested templates
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Button
                    v-for="path in suggestedGeneratedPaths"
                    :key="path"
                    size="sm"
                    variant="secondary"
                    class="font-mono text-xs"
                    :disabled="generatedPaths.includes(path)"
                    :aria-label="`Add ${path}`"
                    @click="addGeneratedPath(path)"
                  >
                    {{ path }}
                  </Button>
                </div>
              </div>

              <div class="mt-4 overflow-hidden rounded-md border border-border bg-bg">
                <div class="flex items-center justify-between border-b border-border px-3 py-2">
                  <span class="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                    Target config snippet
                  </span>
                  <Button size="sm" variant="ghost" @click="copyGeneratedSnippet">
                    <Copy class="size-3.5" />
                    Copy
                  </Button>
                </div>
                <pre
                  class="max-h-64 overflow-auto p-3 font-mono text-xs leading-5 text-text-muted"
                ><code>{{ generatedConfigSnippet }}</code></pre>
              </div>
            </div>
          </Card>
        </div>

        <aside class="grid min-w-0 content-start gap-4">
          <LicenseCard />

          <!-- Watcher -->
          <Card>
            <div class="flex items-start gap-3">
              <span class="rounded-md border border-success/30 bg-success/10 p-2 text-success">
                <RefreshCcw class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtle">
                  File watcher
                </h2>
                <p class="mt-1 text-sm text-text-muted">
                  {{
                    watcherAvailable
                      ? 'Re-run the scan automatically when files change. Useful while refactoring: Architecture Workspace updates without a manual re-scan.'
                      : 'Available only in the desktop app.'
                  }}
                </p>
              </div>
            </div>

            <div class="mt-5 flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-text">Auto re-scan on file change</p>
                <p class="mt-1 text-xs text-text-muted">
                  Watches the project root with OS-level events (debounced 500ms). Turn off on slow
                  disks or very large projects.
                </p>
              </div>
              <Switch
                :model-value="settingsStore.settings.watcher.autoRescan"
                :disabled="!watcherAvailable"
                @update:model-value="settingsStore.setWatcher('autoRescan', $event)"
              />
            </div>
          </Card>

          <!-- Editor -->
          <Card>
            <div class="flex items-start gap-3">
              <span class="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
                <FileCode2 class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtle">
                  Editor
                </h2>
                <p class="mt-1 text-sm text-text-muted">
                  Which editor "Open in editor" launches. The command must be on your PATH.
                </p>
              </div>
            </div>

            <div class="mt-5">
              <label class="text-sm font-medium text-text" for="editor-command">
                Editor command
              </label>
              <Input
                id="editor-command"
                class="mt-2"
                :model-value="settingsStore.settings.editor.command"
                placeholder="code"
                data-test="editor-command"
                @update:model-value="settingsStore.setEditor('command', String($event))"
              />
              <p class="mt-2 text-xs text-text-muted">
                Examples: code (VS Code), cursor, subl (Sublime), webstorm, idea.
              </p>
            </div>
          </Card>

          <!-- Project policies -->
          <Card>
            <div class="flex items-start gap-3" data-test="project-policies">
              <span class="rounded-md border border-info/30 bg-info/10 p-2 text-info">
                <FileCode2 class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtle">
                  Project policies
                </h2>
                <p class="mt-1 text-sm text-text-muted">
                  Project-scoped rules live next to the code, not in this preferences pane.
                </p>
              </div>
            </div>
            <div class="mt-4 flex flex-col gap-2">
              <p class="text-xs text-text-subtle">
                Project-level policies (boundaries, generated paths, contracts) live in
                <code class="rounded bg-surface-2 px-1 py-0.5 font-mono">.archora.json</code>
              </p>
            </div>
          </Card>

          <!-- Reset -->
          <Card>
            <div class="flex items-start gap-3">
              <span class="rounded-md border border-danger/30 bg-danger/10 p-2 text-danger">
                <RotateCcw class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtle">
                  Reset
                </h2>
                <p class="mt-1 text-sm text-text-muted">
                  Restore local workspace preferences to their defaults.
                </p>
              </div>
            </div>
            <Button class="mt-5" variant="danger" @click="resetOpen = true">
              Reset to defaults
            </Button>
          </Card>
        </aside>
      </div>
    </div>

    <Modal v-model:open="resetOpen" title="Reset settings?" @close="resetOpen = false">
      <p class="text-sm text-text-muted">
        Local workspace preferences will be reset. Project rules and scan results will not be
        changed.
      </p>
      <template #footer>
        <Button @click="resetOpen = false">Cancel</Button>
        <Button variant="danger" @click="confirmReset"> Reset to defaults </Button>
      </template>
    </Modal>
  </section>
</template>
