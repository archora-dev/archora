<script setup lang="ts">
import { computed } from 'vue';
import type { ScanResult } from '@/core/analyzer/types';
import { moduleLabel, useCountUp } from '@/shared/lib';
import { useToast } from '@/shared/ui';
import { useDrilldownStore } from '@/features/cockpit-view';
import { useHistoryStore } from '@/entities/history';
import { buildChangeRisk } from '../model/buildChangeRisk';

const props = defineProps<{ scan: ScanResult; focusedModule?: string | null }>();
const drill = useDrilldownStore();
const history = useHistoryStore();
const toast = useToast();

// The same verdict shown here runs in CI as an architecture lock: it fails a PR
// only when the change introduces new problems vs the committed baseline.
const ciCommand =
  'archora check . --base baseline.json \\\n' +
  '  --fail-on new-cycles:0 \\\n' +
  '  --fail-on new-layer-violations:0 \\\n' +
  '  --fail-on new-contract-violations:0';

async function copyCiCommand(): Promise<void> {
  try {
    await navigator.clipboard.writeText(ciCommand);
    toast.show({ title: 'CI gate command copied' });
  } catch {
    toast.show({ title: 'Copy failed — select the command manually' });
  }
}

const LEVEL_LABELS: Record<string, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
};

const DELTA_LABELS: Record<string, string> = {
  newCycles: 'New cycles',
  resolvedCycles: 'Resolved cycles',
  newSignals: 'New signals',
  regressedSignals: 'Regressed signals',
  resolvedSignals: 'Resolved signals',
  addedModules: 'Added modules',
  changedModules: 'Changed modules',
  removedModules: 'Removed modules',
};

// Resolve the baseline the same way the cockpit page does, so the surface is
// self-contained: take the pinned baseline timestamp for the project and find
// its snapshot in history.
const baseline = computed<ScanResult | null>(() => {
  const projectId = props.scan.project.id;
  const baselineAt = history.baselineFor(projectId);
  if (!baselineAt) return null;
  return history.forProject(projectId).find((s) => s.scannedAt === baselineAt)?.scan ?? null;
});

const view = computed(() => buildChangeRisk(props.scan, baseline.value));
const displayedScore = useCountUp(
  computed(() => view.value.score),
  { duration: 480 },
);

const baselineRows = computed(() => {
  const b = view.value.baseline;
  if (!b) return [];
  return [
    { key: 'newCycles', value: b.newCycles },
    { key: 'resolvedCycles', value: b.resolvedCycles },
    { key: 'newSignals', value: b.newSignals },
    { key: 'regressedSignals', value: b.regressedSignals },
    { key: 'resolvedSignals', value: b.resolvedSignals },
    { key: 'addedModules', value: b.addedModules },
    { key: 'changedModules', value: b.changedModules },
    { key: 'removedModules', value: b.removedModules },
  ];
});

// Cap stagger so long lists don't ripple too long (~8 items max delay = 280ms).
const STAGGER_STEP = 40;
const STAGGER_CAP = 8;

function staggerDelay(i: number): string {
  return `${Math.min(i, STAGGER_CAP) * STAGGER_STEP}ms`;
}

function openImpact(target: string): void {
  drill.drillTo('impact', target);
}
</script>

<template>
  <section data-test="change-risk-surface" class="risk-surface">
    <Transition name="verdict-badge" appear>
      <header class="risk-verdict" :data-level="view.level">
        <div class="risk-verdict-badge">
          <span class="risk-verdict-level">{{ LEVEL_LABELS[view.level] }}</span>
          <span class="risk-verdict-score">{{ displayedScore }}</span>
        </div>
        <div class="risk-verdict-copy">
          <p class="risk-verdict-summary">{{ view.summary }}</p>
          <p class="risk-verdict-scale">Risk score 0–100, higher is riskier.</p>
        </div>
      </header>
    </Transition>

    <div v-if="view.reasons.length > 0" class="risk-section">
      <h4 class="risk-section-label">Why</h4>
      <ul class="risk-list">
        <li v-for="(reason, i) in view.reasons" :key="i" class="risk-list-item">{{ reason }}</li>
      </ul>
    </div>

    <div v-if="view.baseline" class="risk-section">
      <h4 class="risk-section-label">Since baseline</h4>
      <dl class="risk-deltas">
        <div v-for="row in baselineRows" :key="row.key" class="risk-delta">
          <dt class="risk-delta-label">{{ DELTA_LABELS[row.key] }}</dt>
          <dd class="risk-delta-value" :data-nonzero="row.value > 0">{{ row.value }}</dd>
        </div>
      </dl>
      <ul v-if="view.regressions.length > 0" class="risk-list risk-regressions">
        <li v-for="(reg, i) in view.regressions" :key="i" class="risk-list-item">{{ reg }}</li>
      </ul>
    </div>
    <p v-else class="risk-baseline-hint">
      Set a baseline in History to add regression tracking against a previous scan.
    </p>

    <div v-if="view.checkFirst.length > 0 || view.affectedAreas.length > 0" class="risk-section">
      <h4 class="risk-section-label">Review first</h4>
      <ul v-if="view.checkFirst.length > 0" class="risk-modules">
        <li
          v-for="(id, i) in view.checkFirst"
          :key="id"
          class="risk-stagger-item"
          :style="{ '--stagger-delay': staggerDelay(i) }"
        >
          <button type="button" class="risk-module" @click="openImpact(id)">
            {{ moduleLabel(id) }}
          </button>
        </li>
      </ul>
      <div v-if="view.affectedAreas.length > 0" class="risk-chips">
        <span v-for="area in view.affectedAreas" :key="area" class="risk-chip">{{ area }}</span>
      </div>
    </div>

    <div v-if="view.guidedActions.length > 0" class="risk-section">
      <h4 class="risk-section-label">Guided actions</h4>
      <ul class="risk-actions">
        <li
          v-for="(action, i) in view.guidedActions"
          :key="i"
          class="risk-stagger-item"
          :style="{ '--stagger-delay': staggerDelay(i) }"
        >
          <button type="button" class="risk-action" @click="openImpact(action.target)">
            <div class="risk-action-head">
              <span class="risk-action-title">{{ action.title }}</span>
              <span class="risk-action-target">{{ moduleLabel(action.target) }}</span>
            </div>
            <p class="risk-action-do">{{ action.action }}</p>
            <p class="risk-action-meta">
              <span class="risk-action-key">Evidence</span>
              {{ action.evidence }}
            </p>
            <p class="risk-action-meta">
              <span class="risk-action-key">Verify</span>
              {{ action.verify }}
            </p>
          </button>
        </li>
      </ul>
    </div>

    <div class="risk-section risk-ci" data-test="change-risk-ci">
      <h4 class="risk-section-label">Enforce in CI</h4>
      <p class="risk-ci-hint">
        Lock this in: fail a PR only when it introduces new cycles or violations vs the baseline.
      </p>
      <div class="risk-ci-command">
        <pre>{{ ciCommand }}</pre>
        <button
          type="button"
          class="risk-ci-copy"
          data-test="change-risk-ci-copy"
          @click="copyCiCommand"
        >
          Copy
        </button>
      </div>
      <p class="risk-ci-hint">
        Drop it into a GitHub Action — see the CI integration guide for the full workflow.
      </p>
    </div>
  </section>
</template>

<style scoped>
.risk-surface {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-4, 1rem);
}

/* Verdict badge: fade + scale on first appearance */
.verdict-badge-enter-active {
  transition:
    opacity 200ms ease-out,
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.verdict-badge-enter-from {
  opacity: 0;
  transform: scale(0.96);
}

.risk-verdict {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: var(--arch-space-3, 0.75rem);
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-md, 0.5rem);
  background: var(--arch-color-surface);
  border-left-width: 4px;
}
.risk-verdict[data-level='low'] {
  border-left-color: var(--color-success, #16a34a);
}
.risk-verdict[data-level='medium'] {
  border-left-color: var(--color-warning, #d97706);
}
.risk-verdict[data-level='high'] {
  border-left-color: #ea580c;
}
.risk-verdict[data-level='critical'] {
  border-left-color: var(--color-danger, #dc2626);
}
.risk-verdict-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.5rem 0.85rem;
  border-radius: var(--arch-radius-sm, 0.375rem);
  min-width: 5.5rem;
}
.risk-verdict[data-level='low'] .risk-verdict-badge {
  background: color-mix(in srgb, var(--color-success, #16a34a) 14%, transparent);
}
.risk-verdict[data-level='medium'] .risk-verdict-badge {
  background: color-mix(in srgb, var(--color-warning, #d97706) 16%, transparent);
}
.risk-verdict[data-level='high'] .risk-verdict-badge {
  background: color-mix(in srgb, #ea580c 16%, transparent);
}
.risk-verdict[data-level='critical'] .risk-verdict-badge {
  background: color-mix(in srgb, var(--color-danger, #dc2626) 16%, transparent);
}
.risk-verdict-level {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.risk-verdict-score {
  font-size: 1.5rem;
  font-weight: 720;
  font-family: var(--arch-font-mono, monospace);
  line-height: 1;
}
.risk-verdict-copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.risk-verdict-summary {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--arch-color-fg);
}
.risk-verdict-scale {
  margin: 0;
  font-size: 0.75rem;
  color: var(--arch-color-fg-muted);
}
.risk-section {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
}
.risk-section-label {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--arch-color-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.risk-list {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.risk-list-item {
  font-size: 0.875rem;
  color: var(--arch-color-fg);
}
.risk-regressions .risk-list-item {
  color: var(--color-danger, #dc2626);
}
.risk-deltas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.5rem;
  margin: 0;
}
.risk-delta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-sm, 0.375rem);
  background: var(--arch-color-surface);
}
.risk-delta-label {
  font-size: 0.7rem;
  color: var(--arch-color-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.risk-delta-value {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  font-family: var(--arch-font-mono, monospace);
  color: var(--arch-color-fg-muted);
}
.risk-delta-value[data-nonzero='true'] {
  color: var(--arch-color-fg);
}
.risk-baseline-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--arch-color-fg-muted);
  padding: 0.6rem 0.75rem;
  border: 1px dashed var(--arch-color-border);
  border-radius: var(--arch-radius-sm, 0.375rem);
}
.risk-modules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

/* Staggered fade+rise for review-first and guided-actions rows */
.risk-stagger-item {
  animation: risk-fade-rise 220ms ease-out both;
  animation-delay: var(--stagger-delay, 0ms);
}
@keyframes risk-fade-rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.risk-module {
  width: 100%;
  text-align: left;
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.8125rem;
  color: var(--arch-color-fg);
  background: transparent;
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-sm, 0.375rem);
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  transition: border-color var(--motion-fast, 120ms);
}
.risk-module:hover {
  border-color: var(--color-primary, #7c6dff);
}
.risk-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.risk-chip {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: var(--arch-color-surface);
  border: 1px solid var(--arch-color-border);
  color: var(--arch-color-fg-muted);
}
.risk-actions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.risk-action {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-md, 0.5rem);
  background: var(--arch-color-surface);
  cursor: pointer;
  transition: border-color var(--motion-fast, 120ms);
}
.risk-action:hover {
  border-color: var(--color-primary, #7c6dff);
}
.risk-action-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.risk-action-title {
  font-size: 0.875rem;
  font-weight: 650;
  color: var(--arch-color-fg);
}
.risk-action-target {
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.75rem;
  color: var(--arch-color-fg-muted);
}
.risk-action-do {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--arch-color-fg);
}
.risk-action-meta {
  margin: 0;
  font-size: 0.78rem;
  color: var(--arch-color-fg-muted);
  line-height: 1.45;
}
.risk-action-key {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-right: 0.35rem;
}

.risk-ci {
  border-top: 1px solid var(--arch-color-border);
  padding-top: var(--arch-space-4, 1rem);
}
.risk-ci-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--arch-color-fg-muted);
}
.risk-ci-command {
  position: relative;
  margin: 0.5rem 0;
}
.risk-ci-command pre {
  margin: 0;
  padding: 0.7rem 0.85rem;
  overflow-x: auto;
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-sm, 0.375rem);
  background: var(--arch-color-surface-2, rgb(124 109 255 / 0.06));
  color: var(--arch-color-fg);
  font-family: var(--arch-font-mono, ui-monospace, monospace);
  font-size: 0.78rem;
  line-height: 1.5;
}
.risk-ci-copy {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--arch-color-border);
  border-radius: 0.4rem;
  background: var(--arch-color-surface);
  color: var(--arch-color-fg-muted);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--motion-fast),
    border-color var(--motion-fast);
}
.risk-ci-copy:hover {
  color: var(--arch-color-fg);
  border-color: rgb(124 109 255 / 0.4);
}
</style>
