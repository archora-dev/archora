# Baseline workflow: ratchet down debt

Turning on a strict gate against an existing codebase usually fails on day one —
there's already debt. A baseline fixes that: you snapshot today's state, then
fail only on changes that make things **worse**. New debt is blocked; old debt
gets paid down over time without blocking every PR.

## 1. Write a baseline

Snapshot the current analysis on your mainline branch and commit it:

```bash
npx @archora/cli baseline write . -o .archora/baseline.json
git add .archora/baseline.json
git commit -m "chore: add architecture baseline"
```

Re-run this command (and commit the result) whenever you intentionally accept a
new state — for example after a planned refactor that legitimately changes the
graph.

## 2. Gate PRs against the baseline

Point `check` at the baseline with `--base` and fail only on regressions. These
rules require `--base`:

```bash
npx @archora/cli check . \
  --base .archora/baseline.json \
  --fail-on new-cycles:0 \
  --fail-on regressed-signals:high \
  --fail-on new-signals:high
```

- `new-cycles:0` — block any cycle that wasn't already in the baseline.
- `regressed-signals:high` — block when an existing high-severity signal gets worse.
- `new-signals:high` — block newly introduced high-severity signals.

Existing debt recorded in the baseline does not fail the build, so the gate is
green on the first run and only turns red when a PR adds something new.

## 3. See the trend

`diff` and `trend` compare the current state against the baseline so you can
watch debt move in the right direction:

```bash
npx @archora/cli diff . --base .archora/baseline.json
npx @archora/cli trend . --base .archora/baseline.json
```

## 4. Tighten over time

As you pay down debt, rewrite the baseline so it captures the improved state.
Each rewrite lowers the bar a notch — the ratchet only turns one way. Eventually
you can drop the baseline entirely and switch to an absolute gate:

```bash
npx @archora/cli check . --fail-on grade:D --fail-on cycles:0
```

## CI

In a PR pipeline, run the baseline gate from step 2. To post the difference as a
PR comment, the `review` command renders a compact Markdown summary with stable
update markers:

```bash
npx @archora/cli review . --base .archora/baseline.json --pr-comment
```
