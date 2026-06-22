# @archora/core

Framework-independent analyzer core for [Archora](../../README.md). Builds a dependency graph
from TypeScript and Vue source files, detects cycles, computes per-module metrics, flags
FSD layer violations, and evaluates user-declared architectural contracts.

No Vue, Pinia, or Tauri dependencies. Runs in Node.js, in a Web Worker, or inside the Tauri desktop app.

## Install

```bash
npm install @archora/core
```

## Usage

```typescript
import { runAnalysis } from '@archora/core';
import { NodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { loadFrontScopeConfig } from '@archora/core/config';

const source = new NodeFsFileSource('/path/to/project');
const config = await loadFrontScopeConfig('/path/to/project');
const result = await runAnalysis(source, config);

console.log(result.graph.cycles.length, 'cycles found');
```

For most use cases prefer the CLI — `@archora/cli` wraps this package and handles argument
parsing, output formatting, and CI exit codes.

## What it computes

- **Dependency graph** — parses `.ts`, `.tsx`, `.js`, `.jsx`, `.vue` (and `.svelte`, beta), resolves `tsconfig` path aliases including recursive alias→alias chains
- **Dynamic & framework-auto edges** — `import()`, `React.lazy`, `next/dynamic`, Vue/Nuxt component and Nuxt `composables/` auto-imports
- **Cycles** — Tarjan's SCC; classifies as direct (length ≤ 2) or indirect
- **Per-module metrics** — fan-in, fan-out, instability, depth, coupling, hotness score
- **Layer violations** — FSD-style rules (`shared → entities → features → widgets → pages → app`)
- **Contract checks** — boundary rules, package budgets, API stability, bundle thresholds from `.archora.json`
- **RSC boundary leaks** — server/client runtime from directives, `server-only`/`client-only` packages and framework conventions; flags `client → server` imports, direct and transitive
- **Bundle signals** — duplicated modules, heavy chunks, solo-hot modules, barrel tree-shaking leaks (from webpack/rollup stats)
- **Temporal coupling** — modules that change together without a static edge (from `git log`), ranked by risk

## FileSource

`FileSource` is the only IO seam — swap implementations to run the analyzer in any environment:

| Implementation | Environment |
|---|---|
| `NodeFsFileSource` | Node.js / CLI |
| `BrowserFsFileSource` | Browser (File System Access API) |
| `TauriFsFileSource` | Tauri desktop |
| `MemoryFileSource` | Tests, Web Worker payload |

## Analyzer pipeline

```
discoverFiles → parseFiles → resolveImports → buildGraph
              → detectCycles → computeMetrics → rankHotZones → ScanResult
```

## License

Apache-2.0 — free for any use, including commercial and CI.
