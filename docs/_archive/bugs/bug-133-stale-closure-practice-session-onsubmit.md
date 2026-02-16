# BUG-133: Stale Closure in Practice Session onSubmit After Async Await

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-16
**Resolved:** 2026-02-16
**Component:** Frontend — Practice Session Controller

---

## Description

The `onSubmit` callback in `usePracticeSessionPageController` awaited `questionFlow.onSubmit()` and then read values (review-stage state, session metadata) from its closure. If a re-render changed those values during the await, the continuation could run with stale state and incorrectly auto-advance.

## Root Cause

`useCallback` captures values at creation time. After the async `onSubmit()` completes, the captured values reflect the state from before the await, not the current state. The auto-advance logic in `maybeAutoAdvanceAfterSubmit` then operates on potentially outdated values.

## Affected File

`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`

## Resolution

Values that must be read *after* the submit await are now read from refs that are updated every render. This makes the handler resilient to re-renders during the async boundary, and eliminates the stale-closure hazard.

Key files:

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

## Acceptance Criteria

- [x] Values read after await use refs
- [x] Stale-closure comment removed
- [x] Regression coverage added

---

## Related

- `maybeAutoAdvanceAfterSubmit` in `practice-session-page-logic.ts`
- React stale closure pattern documentation

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm test:browser`
- `pnpm build`
