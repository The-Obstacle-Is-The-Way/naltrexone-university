# BUG-083: Stale Closure Risk in usePracticeSessionMarkForReview

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-06
**Resolved:** 2026-02-07

---

## Description

The `onToggleMarkForReview` callback depends on `input.sessionInfo?.isMarkedForReview` (a nested property of a nullable object) in its useCallback dependency array. This creates a fragile pattern where the callback captures a stale reference if the dependency comparison only tracks the boolean value, not the parent object.

**Current state:** Not an active bug because the callback only reads `isMarkedForReview` from `sessionInfo`. It's a latent risk during refactoring.

## Affected File

`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts`

```typescript
const onToggleMarkForReview = useCallback(async () => {
  // ...
  const markedForReview = !input.sessionInfo?.isMarkedForReview;  // line 40
  // ...
}, [
  input.isMounted,
  input.question,
  input.sessionId,
  input.sessionInfo,                      // current code depends on full object
  input.sessionMode,
  input.setLoadState,
  input.setReview,
  input.setSessionInfo,
  isMarkingForReview,
]);
```

## Root Cause

If `sessionInfo` changes (e.g., `sessionInfo.index` updates when navigating questions) but `sessionInfo.isMarkedForReview` stays the same, React won't recreate the callback. The callback correctly reads the boolean via closure, but any future reads of other `sessionInfo` properties would be stale.

## Fix

No implementation change required in this branch. First-principles validation shows the callback already depends on `input.sessionInfo` (whole object), so the stale-closure risk from a nested-boolean dependency is not present.

## Verification

- [x] Source validation confirms dependency array includes `input.sessionInfo`
- [x] Existing mark-for-review behavior remains green in test suite

## Related

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts`
