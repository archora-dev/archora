# Pre-commit hook

Run `archora check` before every commit so a new cycle or a dropped grade is
caught locally, not in CI. Two setups:

## Option A: husky

If your project already uses [husky](https://typicode.github.io/husky/):

```bash
npm install --save-dev husky
npx husky init
cp examples/pre-commit/husky-pre-commit .husky/pre-commit
chmod +x .husky/pre-commit
```

The hook in [`husky-pre-commit`](./husky-pre-commit) runs the same gate as CI.

## Option B: plain git hook (no dependencies)

Copy the script into your repo's hooks directory:

```bash
cp examples/pre-commit/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

`.git/hooks/` is not version-controlled, so each contributor installs it once.
The husky option is better if you want the hook tracked in the repo.

## Tuning

A full-project scan can be slow on large repos. To keep commits fast, loosen the
rules (for example only `--fail-on cycles:0`) and let CI run the strict gate, or
keep the check on a pre-push hook instead. See `npx @archora/cli --help` for the
full list of `--fail-on` rules.
