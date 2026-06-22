# Configuration

Archora reads an optional `.archora.json` or `archora.json` from the project root. Without a rules config, it still scans the project with built-in analyzer defaults; the file is for project policy such as layer overrides, contracts, generated-code handling and signal suppressions.

Use `archora init . --dry-run` to inspect a starter config for the current
project. Run `archora init .` to write `.archora.json`; existing config files
are not overwritten unless you pass `--force`.

## Schema

```json
{
  "entryPoints": ["src/main.ts", "src/App.tsx"],
  "ignore": ["dist/**", "coverage/**"],
  "layerOverrides": {
    "src/legacy/**": "infra"
  },
  "analysis": {
    "generated": {
      "mode": "classify",
      "presets": ["openapi", "generated-folder"]
    }
  },
  "contracts": {
    "boundaries": [],
    "budgets": []
  },
  "architectureBudget": {
    "maxDebtScore": 35,
    "maxCycles": 0,
    "maxCriticalSignals": 0,
    "maxContractErrors": 0,
    "maxHotspotGrowth": 2
  },
  "signals": {
    "insightLimit": 6,
    "minInsightSeverity": "medium"
  }
}
```

## Architecture budget

`architectureBudget` is a project-level CI gate. Unlike contract `budgets`,
which apply per module, this block sets repository-wide limits for the current
scan or for regressions against `--base`:

```json
{
  "architectureBudget": {
    "maxDebtScore": 35,
    "maxCycles": 0,
    "maxCriticalSignals": 0,
    "maxContractErrors": 0,
    "maxHotspotGrowth": 2
  }
}
```

`archora check .` can use this block even without explicit `--fail-on` rules.
Every field is optional; omitted fields do not fail the build.

## Layers

Archora has built-in layer detection for common frontend layouts such as `app`, `pages`, `widgets`, `features`, `entities` and `shared`.

A reverse import is reported as a **layer violation** in the Rules view. You can also gate CI on this — see [`check`](/cli/check).

### Rules config via `.archora.json`

For one-off overrides — "this single helper actually belongs in `shared`, not in `features` where its path lives" — use `layerOverrides`:

```json
{
  "layerOverrides": {
    "src/features/auth/lib/jwt.ts": "shared",
    "src/legacy/**": "infra"
  }
}
```

`.archora.json` is meant to be committed alongside the codebase: overrides are project-level architectural decisions, not personal preferences. The desktop app has a GUI editor for this file under the **Layers** icon in the project TopBar (`/project/:id/layer-rules`) — live-preview of violations on every keystroke, atomic save that preserves any other fields in the JSON. See [Working with the graph](./working-with-graph#layer-rules-editor).

The desktop app and CLI call this file **Rules config**:

- **Not configured** means no `.archora.json` or `archora.json` was found. This is not an error; Archora still runs the base analyzer and only custom project rules are disabled.
- **Loaded** means the rules file was found and parsed.
- **Invalid** means the file exists but has JSON/schema issues. Archora soft-fails to defaults and reports diagnostics so you can fix the file before using rule results in CI.

## Contract presets

Start small: copy one preset shape, run a scan, then tighten only the rules your team agrees to enforce.

### FSD-style slices

```json
{
  "contracts": {
    "boundaries": [
      {
        "name": "features-isolation",
        "from": "src/features/*/**",
        "to": "src/features/*/**",
        "mode": "must-not",
        "crossInstance": true,
        "severity": "warning",
        "description": "Feature slices should talk through shared APIs, not sibling internals."
      },
      {
        "name": "shared-not-ui-layers",
        "from": "src/shared/**",
        "to": "src/**",
        "mode": "must-not",
        "except": ["src/shared/**"],
        "severity": "error",
        "description": "Shared code should stay independent from product layers."
      }
    ]
  }
}
```

### Workspace packages

```json
{
  "contracts": {
    "boundaries": [
      {
        "name": "packages-through-public-api",
        "from": "packages/*/src/**",
        "to": "packages/*/src/**",
        "mode": "must-not",
        "crossInstance": true,
        "except": ["packages/*/src/index.*"],
        "severity": "warning",
        "description": "Workspace packages should consume sibling packages through public APIs."
      }
    ],
    "budgets": [
      {
        "name": "package-entry-fanout",
        "module": "packages/*/src/index.*",
        "maxFanOut": 12,
        "severity": "warning",
        "description": "Package entry points should stay narrow enough to review."
      }
    ]
  }
}
```

### Generated OpenAPI clients

```json
{
  "analysis": {
    "generated": {
      "mode": "classify",
      "presets": ["openapi", "generated-folder"]
    }
  }
}
```

Use `mode: "classify"` when generated clients should remain visible but de-prioritised. Use `mode: "exclude"` only when generated files should disappear from the analyzer model.

## Adopting suggested contracts

`archora suggest contracts .` prints a JSON envelope with proposed
`.archora.json` `contracts` plus reasons for each rule. Treat it as a migration
draft, not as an auto-apply step:

1. Run `archora report . --format html` first and review current cycles, layer
   violations and hot zones.
2. Run `archora suggest contracts . --quiet` and copy one rule family at a time
   into `.archora.json`.
3. Start new boundary rules as `"severity": "warning"` unless the project is
   already clean for that boundary.
4. Re-scan and check the Rules view. If the rule reports existing debt, either
   fix the imports first or add a narrow `except` with a reason in the rule
   description.
5. Only promote the rule to `"severity": "error"` after CI has a clean baseline.

This keeps generated suggestions from turning known architecture debt into an
unexpected CI blocker.

Signal suppressions can also live in `.archora.json`. They keep the signal in scan output, mark it as suppressed, and exclude it from CI-safe `signals:*` gates:

```json
{
  "signals": {
    "insightLimit": 6,
    "minInsightSeverity": "medium",
    "minInsightConfidence": "medium",
    "suppressions": [
      {
        "stableKey": "contract:shared-boundary",
        "reason": "Accepted until shared API extraction lands.",
        "createdAt": "2026-05-22T00:00:00.000Z",
        "expiresAt": "2026-06-22T00:00:00.000Z"
      }
    ]
  }
}
```

## Excluded code

Tests and stories are excluded by default (`*.test.*`, `*.spec.*`, `*.stories.*`). Generated `.d.ts` files are excluded. Build configs (`vite.config`, `webpack.config`, ...) are detected and marked as **infra** — they stay in the graph but are filtered out of metrics by default.

## Without a config

Without a config file, Archora:

- Includes everything under the detected entry points.
- Uses built-in layer detection, parser facts and architectural signals.
- Has no custom contracts, overrides, suppressions or generated-code policy.

This is enough for a first scan. Add a rules config when you want project-specific enforcement.
