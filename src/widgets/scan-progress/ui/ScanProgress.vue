<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Check } from 'lucide-vue-next';
import type { ScanPhase } from '@/core/analyzer/types';
import { useScanStore } from '@/entities/scan';
import { useProjectStore } from '@/entities/project';
import { markStartup } from '@/shared/lib/startupTiming';
import { ProgressBar } from '@/shared/ui';

const scan = useScanStore();
const project = useProjectStore();

const PHASE_TEXT: Record<ScanPhase, { label: string; description: string }> = {
  discover: { label: 'Discover', description: 'Finding source files' },
  parse: { label: 'Parse', description: 'Reading files' },
  graph: { label: 'Graph', description: 'Building the dependency graph' },
  cycles: { label: 'Cycles', description: 'Detecting cycles' },
  metrics: { label: 'Risk', description: 'Scoring risk' },
  done: { label: 'Done', description: 'Finishing' },
};

onMounted(() => {
  // Perf signal consumed by diagnostics: when the scan UI first becomes visible.
  performance.mark('archora:first-progress-visible');
  markStartup('first progress visible');
});

// Working phases carry the overall percentage, each weighted evenly (20%).
// `done` is terminal and reads as complete.
const WORKING_PHASES: ScanPhase[] = ['discover', 'parse', 'graph', 'cycles', 'metrics'];
const PHASE_WEIGHT = 100 / WORKING_PHASES.length;

const projectName = computed(() => project.current?.name ?? '');

const hasError = computed(() => scan.status === 'error');

// Fraction completed within the current phase (0..1), or null when the phase
// reports no total (indeterminate work).
const phaseFraction = computed<number | null>(() => {
  const { current, total } = scan.progress;
  if (total === undefined || total <= 0 || current === undefined) return null;
  return Math.min(1, Math.max(0, current / total));
});

const overallPercent = computed(() => {
  const phase = scan.progress.phase;
  if (phase === 'done' || scan.status === 'done') return 100;
  const index = WORKING_PHASES.indexOf(phase);
  if (index === -1) return 0;
  const base = index * PHASE_WEIGHT;
  const within = (phaseFraction.value ?? 0) * PHASE_WEIGHT;
  return Math.min(100, Math.round(base + within));
});

const inPhasePercent = computed<number | null>(() => {
  const fraction = phaseFraction.value;
  if (fraction === null) return null;
  return Math.round(fraction * 100);
});

const counterText = computed(() => {
  const { current, total } = scan.progress;
  if (current === undefined || total === undefined) return '';
  return `${current} / ${total}`;
});

type StepStatus = 'done' | 'active' | 'pending';

const steps = computed(() => {
  const activeIndex =
    scan.progress.phase === 'done' || scan.status === 'done'
      ? WORKING_PHASES.length
      : WORKING_PHASES.indexOf(scan.progress.phase);
  return WORKING_PHASES.map((phase, index) => {
    let status: StepStatus = 'pending';
    if (index < activeIndex) status = 'done';
    else if (index === activeIndex) status = 'active';
    return {
      phase,
      status,
      label: PHASE_TEXT[phase].label,
      description: PHASE_TEXT[phase].description,
    };
  });
});

const activePhaseLabel = computed(() => PHASE_TEXT[scan.progress.phase].label);
const activePhaseDescription = computed(() => PHASE_TEXT[scan.progress.phase].description);
</script>

<template>
  <section class="scan-progress" data-test="scan-progress">
    <header class="scan-progress__head">
      <p class="scan-progress__eyebrow">Scanning</p>
      <h1 class="scan-progress__title">
        {{ projectName ? `Scanning ${projectName}` : 'Scanning project' }}
      </h1>
    </header>

    <div v-if="hasError" class="scan-progress__error" data-test="scan-progress-error">
      <p class="scan-progress__error-title">Scan failed</p>
      <p class="scan-progress__error-message">{{ scan.error }}</p>
    </div>

    <template v-else>
      <div class="scan-progress__meter">
        <div class="scan-progress__meter-head">
          <span class="scan-progress__phase-label">{{ activePhaseLabel }}</span>
          <span class="scan-progress__percent" data-test="scan-progress-percent">
            {{ overallPercent }}%
          </span>
        </div>
        <ProgressBar :value="overallPercent" />
        <p class="scan-progress__phase-desc">{{ activePhaseDescription }}</p>
      </div>

      <ol class="scan-progress__steps">
        <li
          v-for="step in steps"
          :key="step.phase"
          class="scan-progress__step"
          :class="`is-${step.status}`"
          :aria-current="step.status === 'active' ? 'step' : undefined"
        >
          <span class="scan-progress__step-marker" aria-hidden="true">
            <Check v-if="step.status === 'done'" :size="11" :stroke-width="3" />
          </span>
          <span class="scan-progress__step-body">
            <span class="scan-progress__step-label">{{ step.label }}</span>
            <span class="scan-progress__step-desc">{{ step.description }}</span>
          </span>
          <span v-if="step.status === 'active'" class="scan-progress__step-bar">
            <span
              v-if="inPhasePercent !== null"
              class="scan-progress__step-fill"
              :style="{ width: `${inPhasePercent}%` }"
            />
            <span v-else class="scan-progress__step-fill scan-progress__step-fill--indeterminate" />
          </span>
          <span v-if="step.status === 'active' && counterText" class="scan-progress__step-counter">
            {{ counterText }}
          </span>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.scan-progress {
  display: grid;
  gap: 1.5rem;
  width: min(34rem, 100%);
  margin: auto;
  padding: 1.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--elev-2);
}

.scan-progress__eyebrow {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
}

.scan-progress__title {
  margin-top: 0.25rem;
  font-size: 1.1rem;
  font-weight: 650;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.scan-progress__meter {
  display: grid;
  gap: 0.6rem;
}

.scan-progress__meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.scan-progress__phase-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
}

.scan-progress__percent {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
}

.scan-progress__phase-desc {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.scan-progress__steps {
  display: grid;
  gap: 0.85rem;
}

.scan-progress__step {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  color: var(--color-text-subtle);
}

.scan-progress__step-marker {
  display: grid;
  place-items: center;
  width: 1.05rem;
  height: 1.05rem;
  border: 1.5px solid var(--color-border-strong);
  border-radius: var(--radius-full, 9999px);
  color: var(--color-primary-fg);
}

.scan-progress__step.is-done .scan-progress__step-marker {
  border-color: var(--color-success);
  background: var(--color-success);
}

.scan-progress__step.is-active .scan-progress__step-marker {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.scan-progress__step-body {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.scan-progress__step-label {
  font-size: 0.85rem;
  font-weight: 500;
}

.scan-progress__step-desc {
  font-size: 0.76rem;
  color: var(--color-text-subtle);
}

.scan-progress__step.is-done,
.scan-progress__step.is-active {
  color: var(--color-text);
}

.scan-progress__step.is-active .scan-progress__step-label {
  color: var(--color-text);
  font-weight: 600;
}

.scan-progress__step-bar {
  grid-column: 2;
  position: relative;
  height: 0.3rem;
  margin-top: 0.15rem;
  overflow: hidden;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-surface-2);
}

.scan-progress__step-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width var(--motion-base);
}

.scan-progress__step-fill--indeterminate {
  width: 40%;
  animation: scan-progress-indeterminate 1.1s var(--motion-spring, ease-in-out) infinite;
}

.scan-progress__step-counter {
  grid-column: 3;
  grid-row: 1;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.scan-progress__error {
  display: grid;
  gap: 0.4rem;
  padding: 1rem;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
}

.scan-progress__error-title {
  font-weight: 600;
  color: var(--color-danger);
}

.scan-progress__error-message {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

@keyframes scan-progress-indeterminate {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(310%);
  }
}
</style>
