<script setup lang="ts">
import { WorkspaceHealthHeader } from '@/widgets/workspace-health-header';
import { FilterRail } from '@/widgets/filter-rail';
import { FindingsQueue } from '@/widgets/findings-queue';
import { FindingDetail } from '@/widgets/finding-detail';
import { DrilldownHost } from '@/widgets/drilldown-host';
import { ExportAction } from '@/widgets/export-action';
import { CockpitBriefing, buildBriefing } from '@/widgets/cockpit-briefing';
import { CockpitHowto } from '@/widgets/cockpit-howto';
import { ScanProgress } from '@/widgets/scan-progress';
import { AnalysisSettingsBanner } from '@/widgets/analysis-settings-banner';
import { useScanStore } from '@/entities/scan';
import { useProjectStore } from '@/entities/project';
import { buildArchitectureOverview } from '@/entities/architecture';
import { Button, useToast } from '@/shared/ui';
import { RefreshCw, Layers, Flame, Link2, FileWarning } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { OPEN_SEARCH_EVENT, OPEN_PROJECT_EVENT, consumeOpenProjectRequest } from '@/shared/lib';
import { useDrilldownStore, resolveOpenInContext } from '@/features/cockpit-view';
import { type Finding } from '@/entities/finding';
import { useHistoryStore } from '@/entities/history';
import {
  pickDirectory,
  draftProjectRef,
  FsAccessUnavailableError,
  PickDirectoryCancelledError,
} from '@/features/open-project';
import { runScanFlow } from '@/features/scan-project';
import { openSampleProject } from '@/features/open-sample-project';
import { useCockpit } from './useCockpit';

const router = useRouter();
const scan = useScanStore();
const project = useProjectStore();
const history = useHistoryStore();
const toast = useToast();
const drill = useDrilldownStore();
const { result, view } = useCockpit();

const selectedFinding = computed(
  () => result.value?.findings.find((f) => f.id === view.selectedId) ?? null,
);

const baselineScan = computed(() => {
  const current = scan.result;
  if (!current) return null;
  const baselineAt = history.baselineFor(current.project.id);
  if (!baselineAt) return null;
  return (
    history.forProject(current.project.id).find((s) => s.scannedAt === baselineAt)?.scan ?? null
  );
});

const briefing = computed(() => {
  const current = scan.result;
  if (!current || !result.value) return null;
  return buildBriefing({
    overview: buildArchitectureOverview(current),
    baselineOverview: baselineScan.value ? buildArchitectureOverview(baselineScan.value) : null,
    findingsTotal: result.value.total,
    breakdown: current.archDebt.breakdown,
    isBarrel: (targetId) => current.modules.find((m) => m.id === targetId)?.isBarrel === true,
  });
});

const moduleIds = computed(() => new Set((scan.result?.modules ?? []).map((m) => m.id)));

function findPriorityFinding(anchorId: string): Finding | null {
  const findings = result.value?.findings ?? [];
  // The priority anchor is a cycle id, an edge id, or a module id depending on
  // the issue kind. Match by finding id (`cycle:<id>`), then by module anchor.
  return (
    findings.find((f) => f.id === `cycle:${anchorId}`) ??
    findings.find((f) => f.location === anchorId || f.modules.includes(anchorId)) ??
    null
  );
}

function openPriority(anchorId: string): void {
  // The briefing's primary action takes the user to the finding in the queue,
  // selected, with its full detail open — the detail already explains the type.
  // It never opens a raw drill-down, so a non-module anchor can't dump an empty
  // table. Reset the lens first: the briefing surfaces priority issues across
  // both lenses, so a pre-existing finding would be hidden under "changed".
  view.setMode('queue');
  view.setLens('everything');
  const finding = findPriorityFinding(anchorId);
  if (finding) view.select(finding.id);
}

// Picking a finding in the queue closes any open drilldown drawer so its detail
// is visible instead of the drawer sitting on top of it.
function selectFinding(id: string): void {
  view.select(id);
  drill.close();
}

function goToBaseline(): void {
  void router.push({ name: 'history' });
}

// Auto-promote to "changed" lens on first load when a baseline exists,
// unless the user has already chosen a lens explicitly this session.
const lensAutoSet = ref(false);
watch(
  result,
  (r) => {
    if (lensAutoSet.value || !r || view.lens !== 'everything') return;
    const projectId = scan.result?.project.id;
    if (projectId && history.baselineFor(projectId)) {
      view.setLens('changed');
      lensAutoSet.value = true;
    }
  },
  { immediate: true },
);

function openCommand(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}
function openInContext(finding: Finding): void {
  // Type-aware: route to a drill-down only when the finding has a real module
  // anchor; otherwise keep it selected so we never open an empty Impact surface.
  const target = resolveOpenInContext(finding, moduleIds.value);
  if (target.kind === 'drilldown') {
    drill.open(target.surface, target.moduleId);
  } else {
    view.select(finding.id);
  }
}

async function openProject(): Promise<void> {
  try {
    const picked = await pickDirectory();
    const draft = draftProjectRef(picked);
    project.setCurrent(draft);
    await runScanFlow({ source: picked.source, locator: picked.locator });
  } catch (e) {
    if (e instanceof PickDirectoryCancelledError) return;
    if (e instanceof FsAccessUnavailableError) {
      toast.danger('Browser does not support directory picking');
      return;
    }
    toast.danger('Scan failed', (e as Error).message);
  }
}

function openSample(): void {
  openSampleProject();
}

// The global top bar can request an open from any route; when it navigates here
// first, the request is queued and drained on mount, otherwise it arrives as a
// window event while the cockpit is already showing.
onMounted(() => {
  if (consumeOpenProjectRequest()) void openProject();
  window.addEventListener(OPEN_PROJECT_EVENT, openProject);
});
onUnmounted(() => window.removeEventListener(OPEN_PROJECT_EVENT, openProject));
</script>

<template>
  <div class="cockpit" data-test="cockpit-page">
    <AnalysisSettingsBanner v-if="!scan.isRunning" />
    <div v-if="scan.isRunning" class="cockpit-scanning">
      <ScanProgress />
    </div>
    <div v-else-if="!result" class="cockpit-empty">
      <div class="cockpit-empty-hero">
        <p class="cockpit-empty-eyebrow cockpit-enter cockpit-enter-1">Archora</p>
        <h1 class="cockpit-empty-headline cockpit-enter cockpit-enter-2">
          See what your frontend is actually doing
        </h1>
        <p class="cockpit-empty-subcopy cockpit-enter cockpit-enter-3">
          Archora scans your codebase and surfaces the problems that slow teams down — before they
          become blockers.
        </p>

        <div class="cockpit-empty-categories cockpit-enter cockpit-enter-4" aria-hidden="true">
          <div class="cockpit-empty-category">
            <RefreshCw :size="16" class="cockpit-empty-category-icon" />
            <span>Dependency cycles</span>
          </div>
          <div class="cockpit-empty-category">
            <Layers :size="16" class="cockpit-empty-category-icon" />
            <span>Layer violations</span>
          </div>
          <div class="cockpit-empty-category">
            <Flame :size="16" class="cockpit-empty-category-icon" />
            <span>Hotspots</span>
          </div>
          <div class="cockpit-empty-category">
            <Link2 :size="16" class="cockpit-empty-category-icon" />
            <span>Hidden coupling</span>
          </div>
          <div class="cockpit-empty-category">
            <FileWarning :size="16" class="cockpit-empty-category-icon" />
            <span>Contract issues</span>
          </div>
        </div>

        <div
          class="cockpit-empty-actions cockpit-enter cockpit-enter-5"
          data-test="cockpit-empty-actions"
        >
          <Button variant="primary" size="lg" @click="openProject"> Open project </Button>
          <Button variant="secondary" size="lg" @click="openSample"> Try sample </Button>
        </div>
      </div>
    </div>
    <CockpitBriefing
      v-else-if="view.mode === 'briefing' && briefing"
      :briefing="briefing"
      @see-all="view.setMode('queue')"
      @open-priority="openPriority"
      @set-baseline="goToBaseline"
    />
    <template v-else>
      <WorkspaceHealthHeader
        :grade="result.grade"
        :total="result.total"
        :counts-by-type="result.countsByType"
        :lens="view.lens"
        :has-baseline="result.hasBaseline"
        :scanned-at="scan.result?.scannedAt ?? null"
        @update:lens="view.setLens"
        @open-command="openCommand"
        @back-to-briefing="view.setMode('briefing')"
        @set-baseline="goToBaseline"
      />
      <CockpitHowto />
      <ExportAction v-if="scan.result" :scan="scan.result" />
      <div class="cockpit-body">
        <FilterRail
          :active-types="view.types"
          :active-severities="view.severities"
          :include-beta="view.includeBeta"
          :counts-by-type="result.countsByType"
          @toggle-type="view.toggleType"
          @toggle-severity="view.toggleSeverity"
          @update:include-beta="view.setIncludeBeta"
        />
        <div class="cockpit-queue-col">
          <button
            v-if="result.hiddenByTriage > 0 || view.showTriaged"
            type="button"
            class="cockpit-triage-toggle"
            data-test="triage-hidden-toggle"
            @click="view.setShowTriaged(!view.showTriaged)"
          >
            <template v-if="view.showTriaged">Hide snoozed / won't-fix</template>
            <template v-else>{{ result.hiddenByTriage }} hidden by triage — show</template>
          </button>
          <FindingsQueue
            :findings="result.findings"
            :selected-id="view.selectedId"
            :loading="scan.isRunning"
            :project-id="scan.result?.project.id ?? null"
            @select="selectFinding"
          />
        </div>
        <FindingDetail
          :finding="selectedFinding"
          :project-id="scan.result?.project.id ?? null"
          @open-in-context="openInContext"
        />
      </div>
    </template>
    <DrilldownHost />
  </div>
</template>

<style scoped>
.cockpit {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.cockpit-empty,
.cockpit-scanning {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.cockpit-scanning {
  padding: 1.5rem;
}

.cockpit-empty {
  background:
    radial-gradient(ellipse 60% 40% at 50% 0%, rgb(124 109 255 / 0.07), transparent 70%),
    var(--color-bg);
}

.cockpit-empty-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: min(560px, 100%);
  padding: 3rem 2rem 3.5rem;
  text-align: center;
}

.cockpit-empty-eyebrow {
  margin: 0;
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.cockpit-empty-headline {
  margin: 0;
  color: var(--color-text);
  font-size: 1.6rem;
  font-weight: 720;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.cockpit-empty-subcopy {
  margin: 0;
  max-width: 42ch;
  color: var(--color-text-muted);
  font-size: 0.95rem;
  line-height: 1.55;
}

/*
 * Five chips on two centered lines: 3 on the first, 2 on the second.
 * flex-wrap + max-width sized to fit exactly 3 chips per row forces the
 * natural 3+2 break; justify-content: center keeps both rows centred.
 */
.cockpit-empty-categories {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  max-width: 30rem;
}

.cockpit-empty-category {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.4rem 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 560;
  background: var(--color-surface);
  transition:
    border-color var(--motion-fast),
    color var(--motion-fast);
}

.cockpit-empty-category-icon {
  color: var(--color-primary);
  opacity: 0.7;
  flex-shrink: 0;
}

.cockpit-empty-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

/* Staggered entrance for hero elements */
@keyframes empty-fade-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.cockpit-enter {
  animation: empty-fade-rise 300ms ease-out both;
}
.cockpit-enter-1 {
  animation-delay: 0ms;
}
.cockpit-enter-2 {
  animation-delay: 60ms;
}
.cockpit-enter-3 {
  animation-delay: 120ms;
}
.cockpit-enter-4 {
  animation-delay: 180ms;
}
.cockpit-enter-5 {
  animation-delay: 240ms;
}
.cockpit-body {
  display: grid;
  grid-template-columns: 14rem 1fr 22rem;
  flex: 1;
  min-height: 0;
}
.cockpit-queue-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.cockpit-queue-col > .findings-queue {
  flex: 1;
  min-height: 0;
}
.cockpit-triage-toggle {
  flex-shrink: 0;
  padding: 0.375rem var(--arch-space-3, 0.75rem);
  border: 0;
  border-bottom: 1px solid var(--arch-color-border);
  background: var(--arch-color-surface-2);
  color: var(--arch-color-fg-muted);
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;
}
.cockpit-triage-toggle:hover {
  color: var(--arch-color-fg);
}
@media (max-width: 980px) {
  .cockpit-body {
    grid-template-columns: 1fr;
  }
}
</style>
