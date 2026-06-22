# First run

Use this path when evaluating Archora for the first time. It keeps the test
focused on the review artifact instead of internal implementation details.

## 1. Check the CLI

```bash
npx @archora/cli@1.3.0 --help
```

Expected: the command list includes `init`, `analyze`, `check`, `report`,
`review`, `matrix`, `impact`, `ownership`, `semantic`, `hygiene` and `trend`.

## 2. Run a local architecture check

From a frontend repository:

```bash
npx @archora/cli@1.3.0 init . --dry-run
npx @archora/cli@1.3.0 check . --fail-on grade:F
```

Expected: `check` prints a grade, cycle count and violation count. It exits
non-zero only when a configured rule fails.

## 3. Export a review report

```bash
npx @archora/cli@1.3.0 report . --format md -o archora-report.md
npx @archora/cli@1.3.0 report . --format html -o archora-report.html
```

Open the reports and look for:

- top risks;
- cycles and suggested break points;
- layer or contract violations;
- impact and repair next steps.

## 4. Add a baseline

Use this once the team accepts the current mainline state:

```bash
npx @archora/cli@1.3.0 baseline write . -o .archora/baseline.json
npx @archora/cli@1.3.0 check . --base .archora/baseline.json --fail-on new-signals:high --fail-on new-cycles:0
```

This separates new risk from existing debt.

## 5. Request a trial key

```bash
npx @archora/cli@1.3.0 license request --plan trial --out license-request.md
```

Send `license-request.md` to `akotov@archora.dev` or Telegram `@akotofff`.
The file does not include source code, scan data, environment variables or
private absolute paths.

