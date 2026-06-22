# Reports

Archora produces three reports off the same scan. Each answers a different question, so pick the format that matches the audience.

## What you can export

| Format            | Audience                               | Question it answers                                                            |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| **HTML**          | Reviewer, tech lead, code owner        | "What does the architecture look like right now and what should we fix first?" |
| **Fix-plan HTML** | Reviewer, tech lead                    | "Give me the repair plan as an ordered checklist I can open in a browser."     |
| **Fix-plan JSON** | Automation, internal tools, planning   | "Give me the prioritised repair queue with reason / action / verify per item." |
| **Full JSON**     | Integrations, dashboards, custom views | "Give me the entire scan envelope so I can build my own slice."                |
| **JUnit**         | CI / test reporting tabs               | "Surface every cycle and rule violation as a failed test case."                |
| **Markdown**      | PR comments                            | "Drop a compact summary into a code review."                                   |

The desktop **Export** bar saves the architecture HTML, the fix plan and the full JSON. The CLI produces every format: `archora report . --format html|fix-plan|json|junit|md`.

The desktop **Fix plan** button saves the readable HTML document below. The fix-plan JSON the CLI emits for CI stays available through the same save API (`scope: 'fix-plan'`, `format: 'json'`) and through `archora report . --format fix-plan`.

## HTML report

The HTML brief is a single file with no JS, no graph runtime and no external assets. Open it in any browser; commit it to a repo if you want.

It contains:

- **Repair brief** — status, fix-first action, affected areas, rules config state, CI gate suggestion, grade and key counts.
- **Fix first** — the highest-priority finding spelled out as _Action / Why / Verify_.
- **Affected areas** — top areas such as `features/auth`, `shared/api`, `mfes/orders` ranked by risk and finding count.
- **Top priority** — table of the next 9 repair items, each tagged by type and target list.
- **Signal review** — top signals with severity, confidence, state, suppression reason, modules and evidence.
- **Cycles** — top 20 cycles with severity, length, suggested breakpoint, and a sample of modules.
- **Hotspots** — top 20 modules by hotness with fan-in / fan-out and "in cycle" flag.
- **Rule violations** — split per layer / contracts.
- **Rules config diagnostics** — exact `.archora.json` paths and messages when custom rules could not be loaded cleanly.
- **Impact summary** — modules with the largest direct importer set so the reader knows where a change ripples furthest.
- **Verification plan** — short ordered list of the checks to run before claiming the fix is done.

The footer points back to the desktop app for the interactive workspace — the HTML is a brief, not a replacement.

## Fix-plan HTML

The desktop **Fix plan** button saves a standalone HTML document — the readable counterpart to the fix-plan JSON, meant to be opened in a browser and read as an ordered checklist rather than parsed. It renders the same `buildFixPlan` output the CLI emits, so the two never drift.

It contains:

- **Repair order** — the highest-weight findings first, each with a concrete _Action_ and the _Verify_ check that proves it, plus its targets.
- **Suggested batches** — the work grouped by blast radius (`safe-first`, `high-impact`, `review-before-change`): start with the safe batch and review the rest before editing.
- **Verification order** — the checks to run, in order, to confirm each fix landed without regressions.

The raw fix-plan JSON is folded into a `Raw fix plan (JSON)` `<details>` block at the bottom, so a single file carries both the human-readable plan and the machine payload. Use the dedicated JSON export (below) when you only need the structured envelope for tooling.

## Fix-plan JSON

Stable, versioned envelope your tooling can consume:

```json
{
  "kind": "archora-fix-plan",
  "version": 1,
  "exportedAt": "2026-05-12T00:00:00.000Z",
  "appVersion": "archora",
  "project": { "id": "...", "name": "...", "rootPath": "...", "detectedFramework": "vue" },
  "architectureDebt": { "score": 13, "grade": "A", "breakdown": { ... } },
  "summary": {
    "cycles": 7,
    "layerViolations": 1,
    "contractViolations": 0,
    "hotZones": 4,
    "generatedModules": 12
  },
  "priorityFindings": [
    {
      "type": "cycle",
      "id": "cycle:abcdef12",
      "title": "Direct dependency cycle",
      "weight": 100,
      "targets": ["src/a.ts", "src/b.ts"],
      "reason": "2 modules close a dependency cycle.",
      "action": "Break the import from src/b.ts -> src/a.ts.",
      "verify": "Open Cycles and confirm this cycle disappeared after re-scan.",
      "params": { "severity": "direct" }
    }
  ],
  "repairGroups": [
    {
      "id": "review-before-change",
      "title": "Review before change",
      "description": "Findings that need Impact, Rules or Cycles evidence before editing code.",
      "findings": ["cycle:abcdef12"]
    }
  ],
  "evidence": {
    "cycles": [...],
    "layerViolations": [...],
    "contractViolations": [...],
    "hotZones": [...],
    "generatedModules": [...]
  },
  "verificationOrder": ["Verify cycle breakpoints first", "Verify layer boundary fixes"]
}
```

Guarantees:

- `kind` and `version` are stable. Breaking the shape requires bumping `version`.
- `priorityFindings` is sorted by `weight` descending. Findings whose every target is generated are flagged with `generated: true` and aggressively de-prioritised so they never dominate the top of the queue.
- `repairGroups` groups finding ids into `safe-first`, `high-impact` and `review-before-change`. The desktop Overview renders the same grouping as a repair panel.
- Each finding always carries `reason`, `action`, `verify` strings — tooling can render them verbatim.
- `evidence` contains the underlying cycles, violations, hotspots and generated module list (capped) so consumers don't need a second call.

## Applying fixes

Treat the fix-plan as a repair queue, not a rewrite plan:

1. Start with **safe-first** items: unreachable modules and barrel-cycle candidates usually have concrete targets and a small blast radius.
2. For **review-before-change**, open the same item in Architecture Workspace. Check Cycles, Rules and Impact before editing code.
3. Change one boundary at a time. Re-scan after each fix and verify the matching `verify` instruction before taking the next item.
4. Do not update baselines or budget thresholds in the same change that repairs code. Keep the repair and the policy change reviewable.

## Full JSON report

Versioned envelope around the entire `ScanResult`:

```json
{
  "schema": 1,
  "app": "archora",
  "exportedAt": "2026-05-12T00:00:00.000Z",
  "scan": {
    /* full ScanResult: modules, edges, cycles, metrics, ... */
  }
}
```

Use this for diffing in `archora diff`, for storing baselines in CI, or for building custom dashboards. It's bigger than the fix-plan — a few hundred MB on very large monorepos — so prefer the fix-plan when you only need the repair queue.

## Re-export

Every successful export is recorded in **History → Exported reports**. Hit **Re-export** next to any record to repeat the same scope and format on the current scan, with a fresh timestamp in the file name. The button stays disabled when the active scan is from a different project — open that project first, scan, then re-export.

## File names

`archora-<project-slug>-<scope>-<iso-stamp>.<ext>`

- `<scope>` is `report` or `fix-plan`.
- The project slug is the sanitised project name. Diacritics, spaces and punctuation are folded to `-` so the file is safe on any filesystem.

## Failure handling

The export pipeline distinguishes user cancel from real errors:

- Cancelling the OS save dialog (desktop) silently aborts — no toast, no history record.
- Browser/Tauri write errors surface a `danger` toast with the underlying message.
- The history record is only created after the file is on disk.
