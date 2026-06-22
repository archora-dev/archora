/**
 * Scripted self-running product tour over the bundled sample scan. Mirrors the
 * editorial flow in apps/docs/guide/demo-script.md: grade → start here → queue →
 * the cycle in context → export. Each step carries the navigation intent
 * (`action`) the player applies and how long it dwells before auto-advancing.
 */
export type DemoAction = 'grade' | 'priorities' | 'queue' | 'cycle' | 'export';

export interface DemoStep {
  id: string;
  title: string;
  caption: string;
  action: DemoAction;
  /** Dwell time before auto-advancing, in milliseconds. */
  durationMs: number;
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: 'grade',
    title: 'An architecture grade, explained',
    caption:
      'Archora graded this sample a C. The bars under "Why this grade" show exactly what pulled it down — no guessing.',
    action: 'grade',
    durationMs: 6000,
  },
  {
    id: 'priorities',
    title: 'Where to start',
    caption:
      '"Start here" ranks the highest-leverage fixes, each with why it matters and what to do.',
    action: 'priorities',
    durationMs: 6000,
  },
  {
    id: 'queue',
    title: 'The review queue',
    caption:
      'Every finding in one queue, worst first — the list to walk before a release or a refactor.',
    action: 'queue',
    durationMs: 6000,
  },
  {
    id: 'cycle',
    title: 'A finding in context',
    caption:
      'Open the dependency cycle: the exact edge to cut and the modules in its blast radius, ready to act on.',
    action: 'cycle',
    durationMs: 7000,
  },
  {
    id: 'export',
    title: 'Evidence to share',
    caption: 'Export the findings as Markdown for a PR comment or HTML for a team handoff.',
    action: 'export',
    durationMs: 6000,
  },
] as const;

export const DEMO_STEP_COUNT = DEMO_STEPS.length;
