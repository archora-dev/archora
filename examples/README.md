# Archora examples

Copy-pasteable integrations for the free, open-source CLI (`@archora/cli`,
Apache-2.0). Everything here runs the analyzer locally — no code leaves the
machine or CI runner.

| Example | What it shows |
| --- | --- |
| [`github-actions/architecture-check.yml`](./github-actions/architecture-check.yml) | Gate PRs on architecture grade and cycles, post a Markdown report |
| [`ci-gitlab/.gitlab-ci.yml`](./ci-gitlab/.gitlab-ci.yml) | The same gate on GitLab CI |
| [`pre-commit/`](./pre-commit/) | Run `archora check` before each commit (husky or plain git hook) |
| [`baseline-workflow.md`](./baseline-workflow.md) | Ratchet down existing debt with a baseline instead of failing day one |

## The two commands you'll use most

```bash
# Zero-config overview: grade + "fix this first"
npx @archora/cli scan .

# CI gate: exit non-zero when a rule trips
npx @archora/cli check . --fail-on grade:D --fail-on cycles:0
```

Run `npx @archora/cli --help` to see every command and `--fail-on` rule. The
flags used in these examples are taken straight from that help output.
