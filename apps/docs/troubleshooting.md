# Troubleshooting

## Path aliases (`@/foo`) not resolving

**Symptom:** every alias-style import shows up as unresolved (`resolved: false` in the JSON, the warning panel says "Import not resolved").

**Cause:** Archora reads `paths` from `tsconfig.json`. If your `tsconfig.json` `extends` another config and the aliases live in the parent, make sure the chain is complete and resolvable from the project root.

**Fix:**

1. Run the CLI with `FRONTSCOPE_DEBUG=1`:
   ```bash
   FRONTSCOPE_DEBUG=1 npx @archora/cli analyze . --quiet > /dev/null
   ```
   You'll see which `tsconfig.json` was loaded and which `paths` were picked up.
2. Verify each `tsconfig.json` in the `extends` chain actually exists at the path it's pointing at. The most common cause is a workspace-relative path that breaks when `tsconfig` moves.
3. Check `baseUrl`. Aliases without a `baseUrl` resolve relative to the _containing_ tsconfig, which can surprise you in nested workspaces.

If the aliases are intentionally not in `tsconfig.json` (e.g. defined in `vite.config.ts` only), Archora can't see them. Mirror them in `tsconfig.json` — you generally want this anyway for editor support.

## Out of memory on > 5000 modules

**Symptom:** Node crashes with `JavaScript heap out of memory` mid-scan.

**Cause:** The default Node heap (~1.5 GB) is too tight for very large projects with deep dependency graphs.

**Fix:** raise the heap.

```bash
NODE_OPTIONS=--max-old-space-size=4096 npx @archora/cli analyze .
```

If you're regularly above the default and want a permanent fix, add it to your CI environment or your shell profile.

This is a known scaling target — we aim to keep ~5000 modules comfortable on default settings, and we accept that very large monorepos (> 10k modules) need a heap bump for now. Streaming analysis is planned.

## "Permission denied" on macOS

**Symptom:** opening a project from the desktop app, you get a system permission prompt or a silent failure to read files.

**Cause:** macOS's TCC framework restricts apps from reading certain locations (Documents, Downloads, Desktop, removable volumes) without explicit permission.

**Fix:**

1. **System Settings → Privacy & Security → Files and Folders** → grant Archora access to the relevant folder.
2. If Archora doesn't appear in the list, run a scan once first — the request triggers macOS to add it.
3. For unsigned development builds, you may also need to right-click the `.app` and pick **Open** the first time to bypass Gatekeeper.

Once production builds are signed and notarized, this becomes a one-time prompt rather than recurring.

## Wrong language / parser detected

**Symptom:** `.vue` files are reported as parse errors, or `.ts` files end up classified as JavaScript.

**Cause:** file detection is extension-based. If a project ships `.vue` files but doesn't have Vue in its dependencies, Archora might still parse them — but if your `.vue` files use a non-standard `<script lang="?">` value, the script block extraction can fail.

**Fix:**

1. Check the warnings panel (desktop) or `warnings[]` in the JSON output. Each parse failure has a file path and a hint.
2. If you're using a non-standard `<script lang>` (like a transpiled language), drop it back to `<script lang="ts">` or `<script>` — Archora only understands TypeScript/JavaScript.
3. For `.vue` files in a non-Vue project (rare), open an issue. The detection heuristic might need tightening.

## Some imports are missing from the graph

**Symptom:** you know module A imports module B at runtime, but the graph doesn't show that edge.

**Cause:** dynamic loading patterns Archora doesn't model out of the box. The most common ones:

- `import.meta.glob` from Vite — partially supported (literal patterns only).
- Custom MFE/plugin loaders that read paths from JSON or env.
- Webpack `require.context` — not supported.

**Fix:**

```js
// archora.config.js
export default {
  dynamicLoaders: [
    // hint that paths matching these globs are loaded at runtime
    'src/plugins/**/index.ts',
    'src/locales/*.json',
  ],
};
```

The `dynamicLoaders` option wires those globs into the graph as virtual edges from the entry point, so they participate in [isolated-cluster](/how-it-works/recommendations#isolated-cluster) detection and aren't flagged as unused.

## Cycles I "fixed" still show up

**Symptom:** you converted an `import` to `import type`, but the cycle didn't go away.

**Cause:** by default, type-only edges are excluded from the cycle graph. If a cycle still shows after that change, _not all_ edges in the cycle were type-only — there's at least one runtime import you haven't converted.

**Fix:**

1. Open the cycle in the desktop app's Insights panel.
2. Look at the "Imports that close the cycle" list — those are the runtime edges. Convert (or invert) one of them.
3. Re-run the scan.

If you converted everything and the cycle persists, `FRONTSCOPE_DEBUG=1` will show which edges the analyzer saw. Most likely a cached file: if you have an editor with auto-save, ensure the file actually wrote.

## CLI exits with code 2 but the message isn't clear

**Symptom:** `archora check` exits 2 with a parse error, but you can't tell which `--fail-on` was wrong.

**Fix:** the stderr message names the offending rule. If you have many `--fail-on`s and the message is buried, simplify down to one rule at a time:

```bash
archora check . --fail-on grade:D     # is this rule OK?
archora check . --fail-on cycles:0    # this one?
```

Common parse errors: missing `:` (`grade D` instead of `grade:D`), invalid grade letter (`grade:E`), non-integer threshold (`cycles:two`).

## Desktop scan or workspace feels slow

Open the app with `?diagnostics=1` or enable `localStorage.archora.debugPerf = "1"`, reproduce the issue, then run:

```js
window.__frontScopeDiagnostics.download();
```

The JSON snapshot includes startup, scan, parser, analyzer, UI latency, idle
frame, watcher, backend invoke counters and the latest captured runtime error.
Paths and sensitive values are masked before export.

## Still stuck?

[GitHub Issues](https://github.com/archora-dev/archora/issues). Include:

- Archora version (`archora --version`).
- OS + Node version.
- A scan output (JSON) when relevant.
- The exact command you ran.
