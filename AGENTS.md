# AGENTS.md

Coding standards for AI agents and contributors working in this repo. Architecture, commands, and environment gotchas live in [`CLAUDE.md`](./CLAUDE.md); read it first.

## Code comments: document the "why", briefly

When code is driven by a non-obvious constraint (a safety rule, a compatibility shim, a design-doc decision), add a one- or two-line comment explaining **why**. Don't restate what the code does.

## Lint & format

Run `npm run lint` (oxlint) and `npm run format` (oxfmt) before committing; `npm run typecheck` is the CI gate. Never add a `max-lines` disable — split the file or extract a focused module instead. Fix lint findings rather than suppressing them; the only sanctioned rule-off is global `Window` augmentation needing `interface` (already scoped in `.oxlintrc.json`).

## File & module naming

Name files after what they concretely contain (`claude-runner.ts`, `scheduler.ts`), never vague buckets like `utils`, `helpers`, `common`, or `misc`. If you're reaching for `helpers`, the file probably has more than one responsibility.

## Types

- Prefer `type` over `interface` (enforced) except where declaration merging is required.
- Project-owned types belong in `.ts`, not `.d.ts` — `skipLibCheck` makes unresolved refs in `.d.ts` silently become `any`.
- No `any` in `src/` (tests may stub). Validate/narrow `unknown` instead of casting through it.
- `shared/` must stay pure: no `node`/`electron` imports there, since it's consumed by the renderer too.

## Architecture rules

- The renderer talks to the main process **only** through `window.api` (preload bridge). To add capability: channel constant in `shared/ipc.ts` → handler in `main/ipc.ts` (call `broadcast()` after mutations) → preload binding → typed method in `preload/api-types.ts`.
- All persisted state goes through the `core/persistence.ts` `Store` (atomic JSON). Don't read/write the data file directly.
- `core/` is shared by the app **and** the standalone daemon — keep it free of Electron/renderer assumptions.
- Scheduling: manual "Run now" bypasses the scheduler; scheduled runs go through `Scheduler.shouldFire`. When touching scheduling, preserve the `scheduledFor` dedup and the stale-running guard (see CLAUDE.md).

## Platform

Loop targets **macOS only**. Use Node/Electron path utilities (`path.join`, never hardcoded separators), and keep secrets/signing config out of the repo.

## Git

- Conventional-commit style messages (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`).
- Don't commit build output (`out/`, `dist/`), `.DS_Store`, or screenshots — attach evidence to the PR instead.
- Releases are cut by pushing a `vX.Y.Z` tag (see CLAUDE.md / BUILD.md), not by hand-editing release assets.
