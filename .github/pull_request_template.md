## Summary

<!-- What does this change do, and why? Link any related issue. -->

## Screenshots

<!-- For UI changes, attach before/after screenshots here (don't commit image files to the repo). -->

## Testing

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Verified the change in the running app (`npm run dev`)

<!-- Describe what you exercised — e.g. created a routine, ran it, checked history/calendar/tray. -->

## Review checklist

- [ ] No `max-lines` / lint suppressions added (split the file instead)
- [ ] Renderer↔main changes go through the `window.api` preload bridge
- [ ] Persisted-state changes go through `core/persistence.ts` (not raw file I/O)
- [ ] If scheduling was touched: the `scheduledFor` dedup and stale-running guard still hold
- [ ] No secrets, signing material, or build output committed
