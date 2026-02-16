# BUG-133: Stale Closure in Practice Session onSubmit After Async Await

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Frontend — Practice Session Controller

---

## Summary

The `onSubmit` callback in `usePracticeSessionPageController` captures `sessionMode`, `loadState.status`, `sessionInfo`, and `isInReviewStage` in its closure. After `await questionFlow.onSubmit()`, these values may be stale. The code includes a comment acknowledging this risk.

## Root Cause

`useCallback` captures values at creation time. After the async `onSubmit()` completes, the captured values reflect the state from before the await, not the current state. The auto-advance logic in `maybeAutoAdvanceAfterSubmit` then operates on potentially outdated values.

## Affected File

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:45-66`

## Current Mitigation

The code comment on lines 49-51 notes:
> "Today this is safe because mode/info don't change during submit, and auto-advance is gated by `submitResult`."

This is currently correct — `sessionMode` is fixed for the session lifetime, and `sessionInfo` only changes on question navigation (which doesn't overlap with submit). However, this relies on implementation-specific timing assumptions.

## Risk

If future changes introduce concurrent state updates (e.g., background navigator refresh, review stage transitions during submit), the stale closure could cause:
- Auto-advance firing when it shouldn't (or not firing when it should)
- Wrong mode passed to auto-advance logic

## Suggested Fix

Use refs for values that must be read after async operations:

```typescript
const sessionModeRef = useRef(questionFlow.sessionMode);
sessionModeRef.current = questionFlow.sessionMode;

// In onSubmit:
maybeAutoAdvanceAfterSubmit({
  mode: sessionModeRef.current, // Always fresh
  // ...
});
```

## Acceptance Criteria

- [ ] Values read after await use refs or are re-fetched
- [ ] Comment acknowledging stale closure risk is removed
- [ ] Existing tests continue to pass

---

## Related

- `maybeAutoAdvanceAfterSubmit` in `practice-session-page-logic.ts`
- React stale closure pattern documentation
