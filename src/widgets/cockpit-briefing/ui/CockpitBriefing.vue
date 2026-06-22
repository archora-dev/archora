<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue';
import { ArchStat } from '@archora/ui';
import { Button, SeverityMarker, Tooltip } from '@/shared/ui';
import { plural } from '@/shared/lib';
import type { ArchitecturePriorityIssueKind } from '@/entities/architecture';
import type { FindingType } from '@/entities/finding';
import type { BriefingText, CockpitBriefing } from '../model/buildBriefing';

/** Priority issue kinds map onto the queue's finding-type vocabulary for labels. */
function asType(kind: ArchitecturePriorityIssueKind): FindingType {
  if (kind === 'cycle') return 'cycle';
  if (kind === 'layer-violation') return 'layer-violation';
  return 'hotspot';
}

/**
 * The specific subject (module path) that disambiguates same-kind priorities —
 * e.g. two hotspots would otherwise both read just "Hotspot". Cycle/edge ids are
 * not module paths, so they are hidden here.
 */
function subjectPath(targetId: string): string | null {
  if (!targetId || targetId.startsWith('cycle:')) return null;
  return targetId.includes('/') ? targetId : null;
}

const props = defineProps<{ briefing: CockpitBriefing }>();

const emit = defineEmits<{
  (e: 'see-all'): void;
  (e: 'open-priority', targetId: string): void;
  (e: 'set-baseline'): void;
}>();

const priorityMarker: Record<'error' | 'warning' | 'info', 'high' | 'medium' | 'low'> = {
  error: 'high',
  warning: 'medium',
  info: 'low',
};

/** A–F one-line health read; C and F fold in current cycle/violation counts. */
function assessmentText(text: BriefingText): string {
  const cycles = text.params.cycles;
  const layerViolations = text.params.layerViolations;
  switch (text.i18nKey) {
    case 'cockpit.briefing.assessment.A':
      return 'Architecture is in good shape — no cycles or layer breaches block a release.';
    case 'cockpit.briefing.assessment.B':
      return 'Mostly sound. A few structural issues are worth a look but nothing critical.';
    case 'cockpit.briefing.assessment.C':
      return `Workable, but accumulating debt: ${cycles} cycles and ${layerViolations} layer violations are pulling on maintainability.`;
    case 'cockpit.briefing.assessment.D':
      return 'Strained. Cycles and boundary breaches are spreading; plan a focused cleanup before adding scope.';
    case 'cockpit.briefing.assessment.F':
      return `Critical. ${cycles} cycles and ${layerViolations} layer violations make change risky — address the priorities below first.`;
    default:
      return '';
  }
}

const gradeTerm =
  'An A–F read of structural health: cycles, layer breaches, and hotspots weighed against project size.';

const hotspotTerm =
  'A module that is both heavily connected and frequently changed — risk concentrates here.';

const termText: Partial<Record<ArchitecturePriorityIssueKind, string>> = {
  cycle:
    'A loop where modules import each other directly or transitively, so none can change alone.',
  'layer-violation':
    'An import that crosses a forbidden architectural boundary (e.g. shared importing a feature).',
};

/** Tooltip copy for a priority kind; hotspot-family kinds reuse the hotspot term. */
function termFor(kind: ArchitecturePriorityIssueKind): string {
  return termText[kind] ?? hotspotTerm;
}

const findingTypeLabel: Record<FindingType, string> = {
  cycle: 'Cycles',
  'layer-violation': 'Layers',
  hotspot: 'Hotspots',
  contract: 'Contracts',
  coupling: 'Coupling',
  memory: 'Memory',
  'async-lifecycle': 'Async',
  setup: 'Setup',
};

const whyText: Record<ArchitecturePriorityIssueKind, string> = {
  cycle: "Modules in a cycle can't be changed, tested, or reasoned about in isolation.",
  'layer-violation': 'An import crosses a forbidden boundary, eroding the layering you rely on.',
  'high-fan-out': 'This module depends on many others, so it breaks whenever any of them shift.',
  'high-fan-in': 'Many modules depend on this one, so any change here has a wide blast radius.',
  orphan: 'These files are reachable by nothing — likely dead code or a missing entry link.',
  'unstable-module': 'It leans on volatile dependencies, so it changes more often than it should.',
};

const fixText: Record<ArchitecturePriorityIssueKind, string> = {
  cycle:
    "Small loops: cut the suggested edge. Large clusters: decompose them — extract a shared sub-module or split by responsibility; one edge won't untangle them.",
  'layer-violation':
    "Open the finding for the exact import, then move it to a layer that's allowed to import the target.",
  'high-fan-out':
    'Pick this module and trim its imports: depend on one shared entry point instead of many internal files.',
  'high-fan-in':
    'Many modules import this one, so freeze its exports and review changes to it carefully before merging.',
  orphan:
    'Search the repo for the file name; if nothing imports it, delete it, otherwise wire it into an entry point.',
  'unstable-module':
    'Wrap its volatile imports in a small adapter so this module stops changing every time they do.',
};

function priorityWhy(kind: ArchitecturePriorityIssueKind): string {
  return whyText[kind];
}

function priorityFix(kind: ArchitecturePriorityIssueKind): string {
  return fixText[kind];
}

interface DeltaLine {
  text: string;
}

function deltaText(value: number, singular: string, plural_: string): string {
  const count = Math.abs(value);
  const sign = value > 0 ? '+' : '−';
  return plural(count, `${sign}${count} ${singular}`, `${sign}${count} ${plural_}`);
}

const deltaLines = computed<DeltaLine[]>(() => {
  const delta = props.briefing.baselineDelta;
  if (!delta || delta.unchanged) return [];
  const lines: DeltaLine[] = [];
  if (delta.cycles !== 0) lines.push({ text: deltaText(delta.cycles, 'cycle', 'cycles') });
  if (delta.layerViolations !== 0)
    lines.push({ text: deltaText(delta.layerViolations, 'layer violation', 'layer violations') });
  if (delta.hotZones !== 0) lines.push({ text: deltaText(delta.hotZones, 'hotspot', 'hotspots') });
  return lines;
});

// Cap stagger so long lists don't ripple forever.
const STAGGER_STEP = 45;
const STAGGER_CAP = 7;

function staggerDelay(i: number): string {
  return `${Math.min(i, STAGGER_CAP) * STAGGER_STEP}ms`;
}

// Grade-driver bars: the CSS transition on .grade-driver-fill is already
// declared. We trigger it on mount by toggling a flag after one tick so the
// browser has painted the initial width:0 state first.
const driversVisible = ref(false);
onMounted(() => {
  nextTick(() => {
    driversVisible.value = true;
  });
});
</script>

<template>
  <section class="briefing" data-test="cockpit-briefing">
    <header class="briefing-head">
      <Tooltip :content="gradeTerm">
        <span class="briefing-grade" :data-grade="props.briefing.grade">
          <ArchStat label="Health grade" :value="props.briefing.grade" />
        </span>
      </Tooltip>
      <p class="briefing-assessment" data-test="briefing-assessment">
        {{ assessmentText(props.briefing.assessment) }}
      </p>
    </header>

    <div
      v-if="props.briefing.gradeDrivers.length > 0"
      class="briefing-drivers"
      data-test="briefing-drivers"
    >
      <span class="briefing-drivers-label">Why this grade</span>
      <ul class="briefing-drivers-list">
        <li v-for="driver in props.briefing.gradeDrivers" :key="driver.label" class="grade-driver">
          <span class="grade-driver-name">{{ driver.label }}</span>
          <span class="grade-driver-track">
            <span
              class="grade-driver-fill"
              :style="{
                width: driversVisible ? `${Math.round(driver.share * 100)}%` : '0%',
              }"
            />
          </span>
          <span class="grade-driver-share">{{ Math.round(driver.share * 100) }}%</span>
        </li>
      </ul>
    </div>

    <div class="briefing-grid">
      <div class="briefing-col">
        <div class="col-head">
          <h2>Start here</h2>
          <p class="col-hint">The highest-leverage problems, ranked.</p>
        </div>

        <p
          v-if="props.briefing.priorities.length === 0"
          class="briefing-clean"
          data-test="briefing-no-priorities"
        >
          Nothing urgent. The structure is clean enough to ship.
        </p>

        <ol v-else class="priority-list" data-test="briefing-priorities">
          <li
            v-for="(p, i) in props.briefing.priorities"
            :key="p.id"
            class="priority priority-stagger"
            :style="{ '--stagger-delay': staggerDelay(i) }"
            :data-test="`priority-${p.kind}`"
          >
            <div class="priority-head">
              <SeverityMarker :severity="priorityMarker[p.severity]" />
              <Tooltip :content="termFor(p.kind)">
                <span class="priority-title">{{ findingTypeLabel[asType(p.kind)] }}</span>
              </Tooltip>
              <span class="priority-affected">
                {{
                  plural(
                    p.affectedModules,
                    `${p.affectedModules} module`,
                    `${p.affectedModules} modules`,
                  )
                }}
              </span>
            </div>
            <p v-if="subjectPath(p.targetId)" class="priority-subject" :title="p.targetId">
              {{ subjectPath(p.targetId) }}
            </p>
            <p class="priority-why">
              <span class="line-label">Why it matters</span>
              {{ priorityWhy(p.kind) }}
            </p>
            <p class="priority-fix">
              <span class="line-label">What to do</span>
              {{ priorityFix(p.kind) }}
            </p>
            <Button
              variant="ghost"
              size="sm"
              :data-test="`open-priority-${p.kind}`"
              @click="emit('open-priority', p.targetId)"
            >
              Open
            </Button>
          </li>
        </ol>

        <Button variant="primary" data-test="briefing-see-all" @click="emit('see-all')">
          {{ `See all findings (${props.briefing.totals.findings})` }}
        </Button>
      </div>

      <aside class="briefing-side">
        <h2>What changed since baseline</h2>
        <template v-if="props.briefing.baselineDelta">
          <ul v-if="deltaLines.length" class="delta-list" data-test="briefing-delta">
            <li v-for="line in deltaLines" :key="line.text">{{ line.text }}</li>
          </ul>
          <p v-else class="briefing-clean" data-test="briefing-delta-clean">
            No structural change since the baseline.
          </p>
        </template>
        <template v-else>
          <p class="briefing-clean">
            No baseline set. Pick a scan in History as the baseline to track drift over time.
          </p>
          <Button
            variant="secondary"
            size="sm"
            data-test="briefing-set-baseline"
            @click="emit('set-baseline')"
          >
            Set baseline
          </Button>
        </template>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.briefing {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-4, 1rem);
  padding: var(--arch-space-5, 1.5rem);
  overflow: auto;
  height: 100%;
}
.briefing-head {
  display: flex;
  align-items: center;
  gap: var(--arch-space-5, 1.5rem);
}
.briefing-grade {
  display: inline-flex;
  cursor: help;
}
.briefing-assessment {
  margin: 0;
  max-width: 60ch;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: inherit;
}
.briefing-drivers {
  display: grid;
  gap: 0.5rem;
  margin-top: var(--arch-space-3, 0.75rem);
  max-width: 32rem;
}
.briefing-drivers-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--arch-color-fg-muted);
}
.briefing-drivers-list {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.grade-driver {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr) 2.5rem;
  align-items: center;
  gap: 0.6rem;
}
.grade-driver-name {
  font-size: 0.82rem;
  color: var(--arch-color-fg);
}
.grade-driver-track {
  height: 0.45rem;
  border-radius: 999px;
  background: var(--arch-color-surface-2, rgb(124 109 255 / 0.1));
  overflow: hidden;
}
.grade-driver-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--arch-color-accent, #7c6dff), #38bdf8);
  transition: width var(--motion-base, 280ms) ease-out;
}
.grade-driver-share {
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--arch-color-fg-muted);
}
.briefing-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  gap: var(--arch-space-5, 1.5rem);
  align-items: start;
}
.briefing-col {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-3, 0.75rem);
  min-width: 0;
}
.col-head h2,
.briefing-side h2 {
  margin: 0;
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
.col-hint {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--arch-color-fg-muted);
}
.priority-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
  counter-reset: priority;
}
.priority {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: var(--arch-space-3, 0.75rem);
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-md, 0.5rem);
}

/* Staggered fade+rise for priority items */
.priority-stagger {
  animation: priority-fade-rise 240ms ease-out both;
  animation-delay: var(--stagger-delay, 0ms);
}
@keyframes priority-fade-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.priority-head {
  display: flex;
  align-items: center;
  gap: var(--arch-space-2, 0.5rem);
}
.priority-title {
  font-weight: 600;
  cursor: help;
}
.priority-affected {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--arch-color-fg-muted);
}
.priority-subject {
  margin: 0;
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.8125rem;
  color: var(--arch-color-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.priority-why,
.priority-fix {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: inherit;
}
.line-label {
  display: inline-block;
  min-width: 6.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--arch-color-fg-muted);
}
.briefing-side {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
  padding: var(--arch-space-3, 0.75rem);
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-md, 0.5rem);
}
.delta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}
.briefing-clean {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--arch-color-fg-muted);
}
@media (max-width: 980px) {
  .briefing-grid {
    grid-template-columns: 1fr;
  }
}
</style>
