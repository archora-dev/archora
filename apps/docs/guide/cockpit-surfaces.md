# Cockpit surfaces

The desktop cockpit keeps the Architecture Workspace analyzer-first: tables and lists, never a node-link graph. Beyond the always-visible views (Overview, Explorer, Matrix, Cycles, Hotspots, Impact, Rules), three drilldown surfaces answer release-time questions directly.

Open them from the command palette — `Cmd+K` (macOS) or `Ctrl+K` (everywhere). The palette searches surfaces and modules; type the surface name, or part of a module path, and pick the result.

> All three read the active scan. Open a project and scan first; the palette tells you when there is nothing to search.

## Change risk

A "should I merge?" verdict for the current scan. It is the same view the CLI `review` command produces, so the desktop answer and the CI answer never drift.

![Change risk surface showing a medium-risk verdict, reasons, review-first modules and guided actions](/images/cockpit-change-risk.png)

It shows:

- **Risk level and score** — `Low` / `Medium` / `High` / `Critical`, plus a score from 0 to 100 (higher is riskier) and a one-line summary.
- **Why** — the reasons behind the level, as bullets.
- **Review first** — the modules to inspect before broad changes, plus the affected areas.
- **Guided actions** — each carries the concrete _action_, the _evidence_ that justifies it, and the _verify_ step that proves the fix landed.

When you pin a baseline in **History**, the surface adds a **Since baseline** block with regression tracking against the previous scan: new and resolved cycles, new / regressed / resolved signals, and added / changed / removed modules. Regressions are called out explicitly. Without a baseline the surface still works — it just shows the absolute verdict and prompts you to set one in History.

## Dead code

Cleanup ROI. It lists modules with no resolved imports in or out — fully disconnected deletion candidates — so you can recover lines of code with a small, reviewable change.

![Dead code surface with reclaimable LOC, candidate counters and a table of isolated and script-entry modules](/images/cockpit-dead-code.png)

- **Reclaimable LOC** and **Candidates** counters head the surface.
- The table is split into **Isolated** and **Script entry** types. Script entry points are flagged separately because package scripts or CI may still invoke them — confirm before removing those.
- Columns: **Module**, **Type**, **LOC**.

It is deliberately conservative: only modules that are fully disconnected from the dependency model show up — nothing exported, nothing imported. If the surface is empty, nothing is safely removable on connectivity alone.

## Area risk

Where architectural risk concentrates by area — what to review and refactor first.

![Area risk surface ranking areas by concentrated architectural risk](/images/cockpit-ownership.png)

- Areas are ranked by concentrated architectural risk. Columns: **Area**, **Modules**, **Findings**, **Risk** (0–100), **Primary kind**.
- **Drifting areas** highlights areas whose risk concentration is pulling away from the rest of the codebase.
- **Loose hotspots** lists high-risk modules not concentrated in any single area — worth a direct look. Each is clickable straight into Impact.

## Triage

The findings queue is a daily tool, not a one-shot list. Open a finding and **Acknowledge**, **Snooze**, or mark **Won't fix** (with an optional reason). Snoozed and won't-fix findings drop out of the queue — a "N hidden by triage" toggle brings them back, badged — while acknowledged findings stay visible but muted. Triage is remembered per project, so the queue keeps showing only what still needs attention.

## Next

- [First Scan](./first-scan) — the end-to-end walkthrough.
- [Reports](./reports) — exporting the same verdict as a fix plan.
- [How it works](/how-it-works/) — the algorithms behind every insight.
