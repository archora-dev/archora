# Hot zones

A **hot zone** is a module that hurts a lot when you change it: many things depend on it, it depends on many things itself, and ideally it's also large or sits in a cycle. The hotness score ranks modules so the worst offenders surface first.

## Score

For each module:

```
couplingScore = log2(fanIn + 1) * log2(fanOut + 1)        // 0..1 normalized per project
hotnessScore  = couplingScore * (1 + 0.5 * inCycle) * sizeFactor
```

Where:

- `fanIn` — number of modules importing this one.
- `fanOut` — number of modules this one imports.
- `inCycle` — boolean: is this module part of any SCC?
- `sizeFactor` — log-scaled lines-of-code, normalized to ≈ 0.5..1.5.

`log2(x+1)` softens the long tail — a module with 200 importers isn't 100× worse than one with 20. The product (fan-in × fan-out, log-scaled) captures the "stuck in the middle" feeling: a module that's both heavily depended on *and* heavily depends on others is harder to refactor than one that's just heavy in one direction.

The `+50%` bump for being in a cycle reflects that cycles compound the cost of any change. Size matters less than coupling, hence `sizeFactor` is a multiplier, not a primary term.

## Ranking

Top-N modules by `hotnessScore` are the project's hot zones. The desktop app highlights them with a warm color in the graph and lists them in the Insights panel. The CLI exposes them via the `hotZones` field of the JSON envelope.

## What hot zones are *not*

- **They aren't bugs.** A heavily-used utility is supposed to have high fan-in. A coordinator file is supposed to have high fan-out. Hot zones are *attention pointers*, not "fix this."
- **They aren't directly tied to grade.** A project can have legitimate hot zones (a router, a context provider) and still grade A. The grade is dominated by cycles and layer violations.

## When hot zones become recommendations

A hot zone is *promoted* to a recommendation only when extra signals pile up. The clearest case is [`split-god-module`](./recommendations#split-god-module): fan-in in the top 5%, fan-in ≥ 8, **and** ≥ 300 lines of code. All three thresholds must hit. We deliberately don't recommend "do something about hot zone X" without a concrete pattern — that would just be noise.

## See also

- [Recommendations](./recommendations#split-god-module) — when hot zones graduate into actionable advice.
- [Cycle detection](./cycles) — the `+50% inCycle` factor.
