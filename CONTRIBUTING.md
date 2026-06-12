# Contributing to Loop

Thanks for helping improve Loop! This guide covers local setup and the checks every change must pass.

## Prerequisites

- **macOS** (Loop is a macOS-only app).
- **Node 22+** and npm.
- The [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed and authenticated (routines run it).

## Setup

```bash
git clone git@github.com:maxi-scala/loop.git
cd loop
npm install
npm run dev
```

> **Behind a corporate proxy / firewall?** If `npm install` fails downloading the Electron binary, run `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install`, then obtain the matching `electron-v<version>-darwin-arm64.zip`, unzip it into `node_modules/electron/dist/`, and write `node_modules/electron/path.txt` containing `Electron.app/Contents/MacOS/Electron`. See [`CLAUDE.md`](./CLAUDE.md) for details.

## Before you open a PR

Run all four — they're the same gates CI enforces:

```bash
npm run lint       # oxlint
npm run format     # oxfmt --write .  (or: npm run format:check)
npm run typecheck  # tsc (node + web projects)
npm run test       # vitest
```

- Keep changes consistent with [`AGENTS.md`](./AGENTS.md) (naming, comments, types, architecture rules).
- Add or update tests for logic changes (`tests/` uses vitest + jsdom).
- Don't commit `out/`, `dist/`, `.DS_Store`, or PR screenshots.

## Project layout

See [`CLAUDE.md`](./CLAUDE.md) for the architecture (the `shared` / `core` / `main` / `preload` / `renderer` / `daemon` split and the scheduling model). The original design prototype is on the `design-archive` branch.

## Releases

Maintainers cut releases by bumping `version` in `package.json` **and** `package-lock.json` (root), then pushing a tag:

```bash
git tag v0.1.2 && git push origin v0.1.2
```

GitHub Actions builds the macOS DMGs and attaches them to a GitHub Release. See [`BUILD.md`](./BUILD.md).
