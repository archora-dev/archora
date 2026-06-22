<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, EmptyState, Input, SeverityMarker, useToast } from '@/shared/ui';
import type { Finding, FindingText, FindingType } from '@/entities/finding';
import { isTauri } from '@/shared/lib';
import { openInEditor } from '@/features/open-in-editor';
import { useSettingsStore } from '@/entities/settings';
import { useFindingTriageStore, type TriageState } from '@/entities/finding-triage';
import { evidenceRenderer } from '../model/evidenceRegistry';

const props = defineProps<{ finding: Finding | null; projectId?: string | null }>();
const emit = defineEmits<{ (e: 'open-in-context', finding: Finding): void }>();

const toast = useToast();
const settings = useSettingsStore();
const renderer = computed(() =>
  props.finding ? evidenceRenderer(props.finding.evidence.kind) : null,
);

/** Resolves the source-supplied title key into its English headline. */
function findingTitle(title: FindingText): string {
  const p = title.params;
  switch (title.i18nKey) {
    case 'entities.finding.cycle.title':
      return `Dependency cycle across ${p.count} modules`;
    case 'entities.finding.cluster.title':
      return `Tangled cluster of ${p.count} modules`;
    case 'entities.finding.layerViolation.title':
      return `Layer violation: ${p.from} → ${p.to}`;
    case 'entities.finding.hotspot.title':
      return `Hotspot: ${p.module}`;
    case 'entities.finding.contract.title':
      return `Contract violation: ${p.rule}`;
    case 'entities.finding.rscLeak.title':
      return `Server/client boundary leak: ${p.rule}`;
    case 'entities.finding.coupling.title':
      return `Hidden coupling: ${p.a} ↔ ${p.b}`;
    case 'entities.finding.memory.title':
      return `Memory risk: ${p.kind}`;
    case 'entities.finding.asyncLifecycle.title':
      return `Async lifecycle risk: ${p.kind}`;
    case 'entities.finding.setup.title':
      return `Config issue: ${p.field}`;
    default:
      return '';
  }
}

const explanations: Record<FindingType, { what: string; why: string; fix: string }> = {
  cycle: {
    what: 'A dependency cycle: the modules listed below import each other directly or through a chain that loops back.',
    why: "Cyclic modules can't be loaded, tested, or refactored independently, and they hide initialization-order bugs.",
    fix: 'For a small loop, cut the suggested edge and move the shared piece into a module both can import. For a large cluster, no single edge helps — extract a shared sub-module or split it along responsibilities.',
  },
  'layer-violation': {
    what: 'The import shown above crosses a boundary your layer rules forbid (for example, shared importing a feature).',
    why: 'It erodes the layering that keeps lower layers reusable and higher layers replaceable.',
    fix: 'Open the From file and remove that import; put the shared code in a lower layer both sides may import, or pass it in as a parameter.',
  },
  hotspot: {
    what: 'The module shown above ranks high on both connectivity and churn — lots depends on it and it changes often.',
    why: "Risk and rework concentrate here: it's touched often and many things depend on it.",
    fix: "Don't rewrite it blindly. Split off one unrelated responsibility into a new file, and keep its exported API small so dependents don't break.",
  },
  contract: {
    what: 'The import shown above breaks an explicit contract rule, such as a server-only module leaking into client code.',
    why: 'Contract breaks bypass the guarantees a boundary is meant to enforce — they surface as runtime or build failures.',
    fix: 'Open the flagged file and move the import to the allowed side, or split the server-only code into its own module the client never imports.',
  },
  coupling: {
    what: 'The two files above keep changing together in git history, yet neither imports the other.',
    why: 'Hidden coupling means a change in one silently requires a change in the other — easy to miss in review.',
    fix: 'Find the shared concept both files edit around (a type, constant, or rule) and move it into one module both depend on, so the link is visible.',
  },
  memory: {
    what: 'A heuristic flag for a likely memory leak — a listener, subscription, or timer without matching cleanup.',
    why: 'Uncleaned resources accumulate across mounts and degrade long-running sessions.',
    fix: 'Pair every subscription with teardown in the matching lifecycle hook. Verify before trusting this beta signal.',
  },
  'async-lifecycle': {
    what: 'A heuristic flag for async work that may resolve after a component has unmounted.',
    why: 'State updates on an unmounted component cause warnings, leaks, or stale UI.',
    fix: 'Guard async results against the current lifecycle, or cancel in-flight work on teardown. Verify before trusting this beta signal.',
  },
  setup: {
    what: 'A configuration issue affecting how the project is parsed or resolved.',
    why: 'Bad config skews the whole analysis — unresolved paths and missing aliases hide real dependencies.',
    fix: 'Correct the flagged field so the scanner resolves modules the way your build does.',
  },
};

const explain = computed(() => (props.finding ? explanations[props.finding.type] : null));

const editorSupported = isTauri();
const opening = ref(false);

const triageStore = useFindingTriageStore();
const reason = ref('');

const triageProjectId = computed(() => (props.projectId && props.finding ? props.projectId : null));

const triageEntry = computed(() => {
  const id = triageProjectId.value;
  return id && props.finding ? triageStore.entryFor(id, props.finding.id) : undefined;
});

const triageState = computed<TriageState>(() => triageEntry.value?.state ?? 'active');

const triageLabels: Record<Exclude<TriageState, 'active'>, string> = {
  acknowledged: 'Acknowledged',
  snoozed: 'Snoozed',
  'wont-fix': "Won't fix",
};

// Reset the draft reason when switching findings; prefill from an existing entry
// so editing a triaged finding shows its recorded reason.
watch(
  () => props.finding?.id,
  () => {
    reason.value = triageEntry.value?.reason ?? '';
  },
);

function triage(state: Exclude<TriageState, 'active'>): void {
  const id = triageProjectId.value;
  if (!id || !props.finding) return;
  triageStore.setState(id, props.finding.id, state, reason.value);
}

function reactivate(): void {
  const id = triageProjectId.value;
  if (!id || !props.finding) return;
  triageStore.reactivate(id, props.finding.id);
  reason.value = '';
}

/** First evidence line a heuristic finding pins down, so the editor jumps there. */
function evidenceLine(finding: Finding): number | undefined {
  const evidence = finding.evidence;
  if (evidence.kind === 'memory' || evidence.kind === 'async-lifecycle') {
    return evidence.finding.evidence.find((e) => e.line !== undefined)?.line;
  }
  return undefined;
}

async function openSelectedInEditor(): Promise<void> {
  const finding = props.finding;
  if (!finding || !finding.location || !props.projectId || opening.value) return;
  opening.value = true;
  try {
    const line = evidenceLine(finding);
    const result = await openInEditor({
      projectId: props.projectId,
      relativePath: finding.location,
      command: settings.settings.editor.command,
      ...(line !== undefined ? { line } : {}),
    });
    if (result.ok || result.reason === 'unsupported') return;
    // The editor command failed (usually not on PATH). Copy the path so the
    // user can open it manually, and point them at the editor setting.
    if (result.reason === 'failed' && result.path && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(result.path);
        toast.danger(
          `Couldn't run "${result.command ?? ''}". Path copied to clipboard — check the editor command in Settings.`,
        );
        return;
      } catch {
        /* clipboard blocked — fall through to the generic error */
      }
    }
    toast.danger("Couldn't open the editor. Set your editor command in Settings.");
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <aside class="finding-detail" data-test="finding-detail">
    <EmptyState
      v-if="!props.finding"
      data-test="detail-empty"
      title="Select a finding"
      description="Pick a finding from the queue to see evidence, impact, and fixes."
    />
    <template v-else>
      <header class="detail-head">
        <SeverityMarker :severity="props.finding.severity" />
        <h2>{{ findingTitle(props.finding.title) }}</h2>
      </header>

      <dl class="detail-explain" data-test="detail-explain">
        <dt>What is this</dt>
        <dd>{{ explain?.what }}</dd>
        <dt>Why it matters</dt>
        <dd>{{ explain?.why }}</dd>
      </dl>

      <section class="detail-evidence" data-test="detail-evidence">
        <h3>Evidence</h3>
        <component :is="renderer" :finding="props.finding" />
      </section>

      <section class="detail-fix">
        <h3>What to do</h3>
        <p>{{ explain?.fix }}</p>
      </section>

      <div class="detail-actions">
        <Button
          v-if="props.finding.location"
          variant="secondary"
          size="sm"
          data-test="open-in-context"
          @click="emit('open-in-context', props.finding)"
        >
          Open in context
        </Button>
        <Button
          v-if="editorSupported && props.finding.location && props.projectId"
          variant="secondary"
          size="sm"
          :disabled="opening"
          data-test="open-in-editor"
          @click="openSelectedInEditor"
        >
          Open in editor
        </Button>
      </div>

      <section v-if="triageProjectId" class="detail-triage" data-test="detail-triage">
        <h3>Triage</h3>
        <template v-if="triageState === 'active'">
          <Input
            v-model="reason"
            class="triage-reason"
            placeholder="Optional reason"
            data-test="triage-reason"
          />
          <div class="triage-actions">
            <Button
              variant="secondary"
              size="sm"
              data-test="triage-acknowledge"
              @click="triage('acknowledged')"
            >
              Acknowledge
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-test="triage-snooze"
              @click="triage('snoozed')"
            >
              Snooze
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-test="triage-wont-fix"
              @click="triage('wont-fix')"
            >
              Won't fix
            </Button>
          </div>
        </template>
        <template v-else>
          <p class="triage-current" data-test="triage-current">
            <span class="triage-badge">{{ triageLabels[triageState] }}</span>
            <span v-if="triageEntry?.reason" class="triage-current-reason">{{
              triageEntry.reason
            }}</span>
          </p>
          <Button variant="secondary" size="sm" data-test="triage-reactivate" @click="reactivate">
            Reactivate
          </Button>
        </template>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.finding-detail {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-3, 0.75rem);
  padding: var(--arch-space-4, 1rem);
  border-left: 1px solid var(--arch-color-border);
  height: 100%;
  overflow: auto;
}
.detail-head {
  display: flex;
  align-items: center;
  gap: var(--arch-space-2, 0.5rem);
}
.detail-head h2 {
  font-size: 1rem;
  margin: 0;
}
.detail-explain {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.25rem;
  margin: 0;
}
.detail-explain dt {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
.detail-explain dd {
  margin: 0 0 var(--arch-space-2, 0.5rem);
  font-size: 0.875rem;
  line-height: 1.45;
  color: inherit;
}
.detail-evidence h3,
.detail-fix h3 {
  margin: 0 0 0.375rem;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
.detail-fix p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: inherit;
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--arch-space-2, 0.5rem);
}
.detail-triage {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
  padding-top: var(--arch-space-2, 0.5rem);
  border-top: 1px solid var(--arch-color-border);
}
.detail-triage h3 {
  margin: 0;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
.triage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--arch-space-2, 0.5rem);
}
.triage-current {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--arch-space-2, 0.5rem);
  margin: 0;
}
.triage-badge {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.5rem;
  border-radius: var(--arch-radius-sm, 0.25rem);
  background: color-mix(in srgb, var(--arch-color-fg-muted) 16%, transparent);
  color: var(--arch-color-fg);
}
.triage-current-reason {
  font-size: 0.8125rem;
  color: var(--arch-color-fg-muted);
}
</style>
