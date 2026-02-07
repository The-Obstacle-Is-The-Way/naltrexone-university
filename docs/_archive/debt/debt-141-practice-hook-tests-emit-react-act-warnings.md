# DEBT-141: Migrate Practice Hook Tests from renderLiveHook to Browser Mode

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07
**Resolved:** 2026-02-07

---

## Description

Six practice hook suites used `renderLiveHook` (jsdom + `createRoot`) for async state assertions. That harness emitted repeated React `act()` warnings during `pnpm test --run`, creating noisy output and hiding real regressions.

## Root Cause

- `renderLiveHook` relied on `createRoot` polling in jsdom.
- Async state transitions in those suites were not synchronized with React test boundaries, producing warning spam.
- Browser Mode coverage existed but was only being used for component interaction suites, not async hook behavior.

## Fix

1. Migrated async hook behavior coverage into Browser Mode `*.browser.spec.tsx` suites:
   - `app/(app)/app/practice/hooks/use-practice-session-controls.browser.spec.tsx`
   - `app/(app)/app/practice/hooks/use-practice-session-history.browser.spec.tsx`
   - `app/(app)/app/practice/hooks/use-practice-question-flow.browser.spec.tsx`
   - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`
   - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.browser.spec.tsx`
   - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx`
2. Removed async `renderLiveHook` tests from the matching jsdom `*.test.tsx` files, preserving only synchronous contract checks.
3. Deleted obsolete harness files:
   - `src/application/test-helpers/render-live-hook.tsx`
   - `src/application/test-helpers/render-live-hook.test.tsx`
4. Used explicit module mocks for controller boundaries in browser suites so Node-only controller modules are not executed in Chromium runtime.

## Verification

- [x] All 6 hook suites pass as `*.browser.spec.tsx` via `pnpm test:browser`
- [x] `pnpm test --run` has zero React `act()` warnings from practice hook tests
- [x] `render-live-hook.tsx` and `render-live-hook.test.tsx` are deleted
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes

## Related

- `docs/dev/react-vitest-testing.md`
- `vitest.browser.config.ts`
- `src/application/test-helpers/render-hook.tsx`
