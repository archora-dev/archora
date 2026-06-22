# Contributing to Archora

Thanks for taking the time to contribute. Archora is **open-core**, so where a
change lands decides how it's handled:

| Area | License | External contributions |
| --- | --- | --- |
| `packages/core` — the analyzer engine | Apache-2.0 | **Welcome** (DCO sign-off) |
| `packages/cli` — the command-line tool | Apache-2.0 | **Welcome** (DCO sign-off) |
| `src/` — Vue desktop UI | Source-available, proprietary | Not accepted via PR |
| `src-tauri/` — Tauri/Rust shell | Source-available, proprietary | Not accepted via PR |

The free core and CLI cover the full analysis: cycles, hot zones, layer
violations, architectural contracts, temporal coupling (git churn), RSC
server/client leaks, and bundle bloat. The desktop app (team workspace,
history, dashboards) is the paid product that funds development. Keeping the
desktop closed is what lets the core stay free and well-maintained — that's the
deal, and we'd rather be upfront about it than vague.

If you have an idea for the desktop app, open a
[discussion](https://github.com/archora-dev/archora/discussions) or email
**akotov@archora.dev**. We read everything; we just can't merge desktop PRs from
outside without a separate arrangement.

## Sign-off (DCO)

Contributions to `packages/core` and `packages/cli` are accepted under the
[Developer Certificate of Origin](https://developercertificate.org/). No CLA, no
copyright assignment — you keep ownership of your work and license it under
Apache-2.0.

Add a `Signed-off-by` line to every commit:

```bash
git commit -s -m "fix(core): handle empty barrel files"
```

That appends:

```
Signed-off-by: Your Name <you@example.com>
```

By signing off you confirm you wrote the change (or have the right to submit it)
and agree to contribute it under the project's Apache-2.0 license. Don't submit
code you don't own or that carries an incompatible license.

## Local setup

Package manager is **npm** (workspaces). Node 20+ is recommended.

```bash
git clone https://github.com/archora-dev/archora.git
cd archora
npm install
```

Useful scripts:

```bash
npm run cli -- --help        # run the CLI from source
npm run cli -- scan .        # zero-config overview of the working dir
npm run test                 # run the test suite
npm run typecheck            # TypeScript across the workspace
npm run lint                 # ESLint (also enforces the boundary rules below)
npm run dev                  # web UI on http://localhost:6173 (desktop preview)
```

Run the **narrowest** relevant check before opening a PR — typecheck, lint, and
the tests for the files you touched. Save full runs for release.

## Boundaries you must respect

These are enforced by ESLint and CI, not just convention:

- **`packages/core` is runtime- and UI-agnostic.** It must not import `vue`,
  `pinia`, `@tauri-apps/*`, `vue-i18n`, or `vue-router`. The analyzer has to run
  anywhere Node runs.
- **`packages/cli` is a thin wrapper over core.** Argument parsing, output
  formatting, exit codes — yes. Analysis logic — no; that belongs in core.
- **The desktop UI in `src/` follows Feature-Sliced Design.** Layer import order
  is `app → pages → widgets → features → entities → shared`. A layer may only
  depend on layers below it.

If a change needs to cross one of these lines, raise it in an issue first.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). Look at
`git log --oneline -20` for the house style. Common shapes:

```
feat(cli): add --group-by package to the matrix command
fix(core): skip type-only imports when scoring churn
docs(readme): clarify open-core licensing
chore(release): bump cli to 1.0.4
test(core): cover cyclic re-exports
```

Use the area in scope (`core`, `cli`, `readme`, etc.) and write the subject in
the imperative mood. Keep one logical change per commit where you can.

## Proposing a change

1. For anything non-trivial, open an issue or discussion first so we can agree on
   the approach before you write code.
2. Branch from `dev`.
3. Make the change in `packages/core` and/or `packages/cli`, with tests.
4. Run typecheck, lint, and the relevant tests.
5. Commit with `-s` (DCO sign-off) and Conventional Commit messages.
6. Open a PR against `dev`. Fill in the PR template.

## Reporting bugs and requesting features

Use the issue templates:

- [Bug report](https://github.com/archora-dev/archora/issues/new?template=bug_report.yml)
- [Feature request](https://github.com/archora-dev/archora/issues/new?template=feature_request.yml)

Security issues go through
[private advisories](https://github.com/archora-dev/archora/security/advisories/new),
never public issues.

## Code style

Code should read like it was written by an experienced maintainer. Use domain
names and existing patterns; avoid generic placeholders like
`EnhancedSomething`, `SmartManager`, `DataProcessor`, or `HelperUtils`. Comments
explain non-obvious architectural, performance, security, or compatibility
decisions — not the obvious.
