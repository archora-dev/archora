# Installation

Archora ships from a single repository: [github.com/archora-dev/archora](https://github.com/archora-dev/archora).

The 1.0.3 release target for the public CLI is `@archora/cli@1.3.0`. Desktop bundles are released separately.

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- For the desktop app: Rust toolchain (stable) — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites).

## Clone the repo

```bash
git clone https://github.com/archora-dev/archora.git
cd archora
npm install
```

## Desktop app

```bash
npm run tauri:dev
```

This starts the Vite dev server and opens the Tauri window. The first run takes a minute (Rust compilation); subsequent runs are fast.

For a production build:

```bash
npm run tauri:build
```

The unsigned local build lands in `src-tauri/target/release/bundle/`.

## CLI

Public CLI:

```bash
npx -y @archora/cli@1.3.0 init .
npx -y @archora/cli@1.3.0 check .
npx -y @archora/cli@1.3.0 report . --format md -o archora-report.md
```

For pinned CI installs:

```bash
npm install --save-dev @archora/cli
npx archora check .
```

For local development from the repository checkout, run the workspace package via `vite-node`:

```bash
# from repo root
npm run cli -- analyze /path/to/your/project > scan.json

# or, equivalently
npx vite-node packages/cli/src/index.ts -- analyze /path/to/your/project
```

See the [CLI overview](/cli/) for the full command set.

## What's coming

- Signed desktop installers for macOS and Windows.
- Automated checkout and license delivery.
