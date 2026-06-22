# Your first scan

This page walks through a scan end-to-end. Pick any TypeScript / Vue / React / Svelte project you have lying around — even a small one is fine.

## 1. Open the project

In the desktop app, hit **Open Project** and pick the repository root (the directory with `package.json`).

Archora detects the framework, reads `tsconfig.json` (including `extends` chains), and shows a confirmation panel with the auto-detected entry points. Adjust the include / exclude globs if needed, then **Scan**.

> The sidebar rail keeps an **Open project** action visible at all times, so you can switch repositories mid-analysis — not only from the empty state. It opens the same folder picker from any page; from History or Settings it returns you to the cockpit first.

> The scan runs entirely in-process. For ~1000 modules it takes about 2 seconds; for ~5000 modules — about 10 seconds.

## 2. Read the Overview

When the scan finishes, you land on the project page:

- **Overview** — architecture grade, main risk and the first recommended fix.
- **Step-by-step check** — a compact workflow that moves from Review to Impact,
  Cycles/Rules, API surface and report export.
- **Review** — release/PR risk score, main drivers and the first modules to
  inspect before broad changes.
- **Priority queue** — severity, reason, target and next action.
- **Inspector** — problem, evidence, suggested fix, impact and raw details when needed.

The first question is not “what does the graph look like?” It is “what should I fix first, why, and how do I verify it safely?”

## 3. Drill into a hot zone

Open **Hotspots** or select a high-risk row in **Explorer**. Hotspots are a sortable review table with fan-in, fan-out, degree, cycles, violations, LOC, instability and debt columns. The Inspector keeps the diagnosis visible:

- why the module or folder is risky;
- modules inside the selected folder, capped to the most relevant rows;
- incoming/outgoing dependency evidence;
- suggested verification path;
- related cycles or rule violations.

If you have an editor configured (see [Configuration](./configuration)), the file path is clickable and opens in your editor.

## 4. Understand a cycle

Open **Cycles**. Cycles are shown as repair items, not as a raw node-link graph:

- readable dependency chain;
- direct/indirect severity;
- suggested breakpoint;
- affected modules and related violations.

The suggested breakpoint is computed from the cycle evidence and is meant to narrow the refactor, not to auto-rewrite business code.

## 5. Check impact

Open **Impact** from an inspector action or pick a target manually. The view keeps the affected modules table next to direct importers, outgoing imports, affected folders, related cycles and affected rules, so you can verify blast radius without opening a visual graph.

## 6. Review rules

Open **Rules** to review layer and contract violations from built-in analysis plus `.archora.json` project policy. Each violation keeps the explanation, suggested fix, related findings and a shortcut back to the Layer Rules editor.

## 7. Save a snapshot

Open **Export** in the project TopBar:

- **Full HTML report** — readable architecture brief for review.
- **Markdown report** — compact PR comment with a review checklist and baseline
  regression drivers when a baseline is supplied.
- **Fix plan JSON** — evidence-backed repair queue for planning.
- **Full JSON report** — complete analyzer payload for integrations.

## What's next on the project page

- `Cmd+K` — quick search across modules with `path:`, `export:`, `import:`, `kind:` prefixes.
- TopBar **Layers** icon — GUI editor for `.archora.json` layer overrides with live violation preview.
- Settings → Watcher — auto re-scan whenever a relevant file changes (Tauri only).
- Wand-shaped button on a `type-only-candidate` insight — one-click `import` → `import type` rewrite with side-by-side diff and backup.

See [Working with the Architecture Workspace](./working-with-graph) for the full walkthrough.

## Next

- [How it works](/how-it-works/) — algorithms behind every insight.
- [CLI](/cli/) — get the same data in CI.
- [Configuration](./configuration) — exclude vendored code, configure layers.
