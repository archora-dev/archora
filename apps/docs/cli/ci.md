# CI integration

The CLI is designed for CI: everything goes through `analyze` → `report` → `check`, all of which are non-interactive, exit cleanly, and stream JSON / Markdown / JUnit on stdout.

The recommended public path is the npm CLI package: `npx -y @archora/cli@1.3.0 ...`. The repository GitHub Action exists, but keep it as a secondary integration path until it is re-tested from a clean external repository.

## GitHub Actions

### 1. Block PRs that introduce cycles or D-grade

```yaml
# .github/workflows/archora.yml
name: Architecture
on:
  pull_request:
  push:
    branches: [main]

jobs:
  scope:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Archora check
        run: npx -y @archora/cli@1.3.0 check . --fail-on grade:D --fail-on cycles:0
```

### 2. Comment a compact PR review

```yaml
- name: Fetch main
  run: git fetch origin main:main
- name: List changed files
  id: changed
  run: |
    {
      echo 'files<<EOF'
      git diff --name-only main...HEAD | paste -sd, -
      echo EOF
    } >> "$GITHUB_OUTPUT"
- name: Baseline scan from main
  run: git worktree add /tmp/main main
- name: Write baseline scan
  run: npx -y @archora/cli@1.3.0 analyze /tmp/main -o baseline.json
- name: Generate PR review
  run: npx -y @archora/cli@1.3.0 review . --base baseline.json --pr-comment --changed-files "${{ steps.changed.outputs.files }}" -o archora-pr.md
- name: Comment on PR
  uses: marocchino/sticky-pull-request-comment@v2
  with:
    path: archora-pr.md
```

`review --pr-comment` adds stable markers so the same pull request comment can
be updated instead of creating a new comment on every push. Use the full report
when you want the complete checklist and evidence table:

```yaml
- name: Generate full report
  run: npx -y @archora/cli@1.3.0 report . --format md -o archora.md
- name: Comment on PR
  uses: marocchino/sticky-pull-request-comment@v2
  with:
    path: archora.md
```

### 3. Architecture lock: block PRs that add new violations

This is the strongest gate. Instead of an absolute cap (which a legacy codebase
fails on day one), it diffs the PR against `main` and fails only when the change
*introduces* new architecture problems — so a team can adopt it without first
cleaning up the whole repo.

```yaml
- name: Fetch main
  run: git fetch origin main:main
- name: Baseline scan from main
  run: git worktree add /tmp/main main
- name: Write baseline scan
  run: npx -y @archora/cli@1.3.0 analyze /tmp/main -o baseline.json
- name: Block new architecture violations
  run: |
    npx -y @archora/cli@1.3.0 check . --base baseline.json \
      --fail-on new-cycles:0 \
      --fail-on new-layer-violations:0 \
      --fail-on new-contract-violations:0
```

Each `new-*` rule only counts problems absent from the baseline; pre-existing
debt never trips the gate. Pair it with a grade floor so the codebase cannot
silently slide: `--fail-on grade:C`.

## GitLab CI

```yaml
archora:
  image: node:20
  script:
    - npx -y @archora/cli@1.3.0 check "$CI_PROJECT_DIR" --fail-on grade:D --fail-on cycles:0
    - npx -y @archora/cli@1.3.0 report "$CI_PROJECT_DIR" --format junit -o archora-junit.xml --quiet
  artifacts:
    when: always
    reports:
      junit: archora-junit.xml
```

GitLab's "Tests" tab will pick up the JUnit file automatically and surface every cycle / violation as a failed test case.

For merge request discussions, keep the comment body short and store the full
report as an artifact:

```yaml
archora_review:
  image: node:20
  script:
    - npx -y @archora/cli@1.3.0 review "$CI_PROJECT_DIR" --pr-comment -o archora-pr.md --quiet
    - npx -y @archora/cli@1.3.0 report "$CI_PROJECT_DIR" --format md -o archora-full.md --quiet
  artifacts:
    when: always
    paths:
      - archora-pr.md
      - archora-full.md
```

## GitHub Action path

Marketplace metadata lives in the repository root `action.yml`, so the stable
release reference is:

```yaml
- uses: archora-dev/archora@v1.3.0
```

Use this only as a secondary path until it is verified from a clean external repository. The npm CLI path above is the recommended buyer integration.

Action checklist:

1. Run it from a public external repository.
2. Confirm the action archive downloads cleanly.
3. Confirm the wrapper runs the same CLI version as the published npm package.
4. Add it as a second documented path only after that smoke passes.

## GitHub Action inputs

The repository action is a thin wrapper over the CLI. It builds the bundled CLI from the action checkout, then runs it against the workflow workspace.

| Input           | Default            | Meaning                                                                                                                                     |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`       | `check`            | CLI command: `check`, `analyze`, `report`, `review`, or `diff`.                                                                             |
| `path`          | `.`                | Path to scan. Relative paths resolve from `GITHUB_WORKSPACE`; absolute paths are accepted.                                                  |
| `fail-on`       | `grade:D cycles:0` | Space, comma, or newline separated rules for `check`.                                                                                       |
| `base`          | empty              | Baseline JSON path for `diff`, `check`, `review`, or `report`. Relative paths resolve from `GITHUB_WORKSPACE`; absolute paths are accepted. |
| `format`        | empty              | Report format for `report`.                                                                                                                 |
| `output`        | empty              | Output file path. Relative paths resolve from `GITHUB_WORKSPACE`; absolute paths are accepted.                                              |
| `pr-comment`    | `false`            | Adds `--pr-comment` for compact `review` output with stable comment markers.                                                                |
| `changed-files` | empty              | Comma-separated module paths for the `review --changed-files` PR focus section.                                                             |
| `quiet`         | `true`             | Adds `--quiet` to the CLI invocation.                                                                                                       |

## Local `npm` script

For day-to-day work without CI, expose the same checks through `package.json` so contributors can run them before pushing:

```json
{
  "scripts": {
    "scope": "archora check . --fail-on grade:D --fail-on cycles:0",
    "scope:report": "archora report . --format html -o archora-report.html",
    "scope:fix-plan": "archora report . --format fix-plan -o archora-fix-plan.json"
  }
}
```

Run `npm run scope` for the gate, `npm run scope:report` for the human-readable HTML brief, and `npm run scope:fix-plan` for the JSON envelope your tooling can consume.

## Pre-commit (Husky, after npm publication)

```bash
# .husky/pre-commit
npx -y @archora/cli@1.3.0 check . --fail-on cycles:0 --quiet
```

This is intentionally light — only the "no new cycles" rule. Heavier rules belong in CI.

## Tips

- Cache `node_modules` between runs as you would for any Node CLI; the analyzer itself has no cache directory.
- `--quiet` is recommended in CI to keep logs clean. Errors and rule failures still surface on stderr.
- Long scans (≥ 5000 modules) finish in well under a minute on a 4-core runner. If your job times out, suspect the install step, not the scan.
