# Working with the Architecture Workspace

Once a scan finishes, the project page is the daily driver: it has analyzer tabs, a persistent Inspector, quick search, an inline editor for layer rules, an auto-rescan watcher, exports, and a one-click fix for type-only cycles.

## Quick search (`Cmd+K` / `Ctrl+K`)

Hit `Cmd+K` from any page (project, dashboard, settings) to open a global search overlay over the current scan. Substring matches go against module path and exports by default. Prefixes narrow the search:

- `path:src/features` — only modules whose path matches.
- `export:useAuth` — only modules that export the given binding.
- `import:react-query` — only modules that import from the given specifier.
- `kind:store` — only modules of a given kind (`store`, `component`, `composable`, `entry`, `api`, `service`, `model`, `schema`, `module`, `util`).

Multiple prefixes combine with AND (`kind:store path:checkout` — stores under the checkout feature). Free-form words combine with OR over path and exports. Negation is supported via `!`: `path:!__tests__`.

Click any result to navigate to the matching item in the Architecture Workspace. If the search is opened from outside the project page (e.g. Dashboard), the overlay shows the current project name in its header — those are still results from your last scan, not whatever you typed.

## Layer rules editor

The desktop app exposes `.archora.json` `layerOverrides` as a real GUI: open a project and click the **Layers** icon in the TopBar (route `/project/:id/layer-rules`).

- **Left** — list of rows: `glob` (Input) + `layer` (Select) + remove button. Empty pattern, invalid glob, and unknown layer names are highlighted inline.
- **Right** — live preview: list of layer violations against the current scan, recomputed on every keystroke. New violations introduced by your draft are flagged with a *new* badge; ones that disappear simply drop out.
- **Save** — writes back to `.archora.json`, merging with whatever else is in the file (`entryPoints`, `dynamicLoaders`, `ignore` — the GUI doesn't touch those).
- **Save and re-scan** — also kicks a fresh full scan so violations re-flow through the workspace immediately.
- **Copy JSON snippet** — for the browser build (no file write); paste into the file by hand.

Layers themselves are still defined in `archora.config.{ts,js,json}` — the editor only lets you override per-module classifications, not the layer order.

## Auto re-scan on file change

In the desktop build, Archora can watch the project's filesystem and re-run the scan whenever a relevant file changes. There's a single setting in **Settings → Watcher** — *Auto re-scan on file change* (default on, ignored in the browser build).

- The watcher uses Rust `notify` under the hood; it respects `.gitignore` and the same supported extensions as the scanner.
- Changes are debounced (200 ms in Rust, +500 ms in the JS layer) so a `git checkout` of 50 files doesn't kick off 50 scans.
- The TopBar shows a `● live` indicator while the watcher is attached and the time of the last detected change.

For very large projects on slow disks, the watcher is the second-cheapest signal — turn it off and use the manual **Re-scan** button if it gets in the way.

## Type-only auto-fix

Insights of kind **type-only-candidate** get a wand-shaped button next to the `?`. Click it to open a side-by-side diff:

- **Left** — current import, with the line to be changed highlighted in red.
- **Right** — the patched version: `import { Foo }` → `import type { Foo }`. If only some bindings are type-only, the import is split (`import { runtime } from 'x'; import type { Foo } from 'x';`) — the value side stays put.

Three actions:

- **Apply** — writes the file. A backup is dropped at `<project>/.archora/backups/<iso-timestamp>-<safe-rel>.bak` first; the old one is best-effort cleaned after 7 days.
- **Apply and re-scan** — also kicks a full scan; if the original recommendation is gone, you get a *cycle resolved* toast.
- **Copy patch** — unified-diff to the clipboard, no file write. The browser build only allows this option (see notice in the dialog).

The dialog refuses to apply when the scan is older than 5 minutes — re-scan first to make sure the patch still aligns with the current code.

This is the one and only auto-fix in Archora. The other recommendation kinds (`split-god-module`, `cycle-break-cluster`, …) are deliberately advice-only — heuristics there don't give a deterministic refactor, and a wrong "auto-fix" would be worse than no fix at all.
