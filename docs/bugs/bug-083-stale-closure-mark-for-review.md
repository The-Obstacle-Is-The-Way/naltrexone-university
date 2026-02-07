# BUG-083: Stale Closure Risk in usePracticeSessionMarkForReview

**Status:** Open
**Priority:** P3
**Date:** 2026-02-06

---

## Description

The `onToggleMarkForReview` callback depends on `input.sessionInfo?.isMarkedForReview` (a nested property of a nullable object) in its useCallback dependency array. This creates a fragile pattern where the callback captures a stale reference if the dependency comparison only tracks the boolean value, not the parent object.

**Current state:** Not an active bug because the callback only reads `isMarkedForReview` from `sessionInfo`. It's a latent risk during refactoring.

## Affected File

`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts:88-98`

```typescript
const onToggleMarkForReview = useCallback(async () => {
  // ...
  const markedForReview = !input.sessionInfo?.isMarkedForReview;  // line 40
  // ...
}, [
  input.isMounted,
  input.question,
  input.sessionId,
  input.sessionInfo?.isMarkedForReview,  // ← dependency is nested boolean
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

Depend on `input.sessionInfo` directly instead of the nested boolean:

```typescript
}, [
  // ...
  input.sessionInfo,  // ← depend on the whole object
  // ...
]);
```

## Verification

- [ ] Mark-for-review toggle works correctly in exam mode
- [ ] No stale values observed when rapidly navigating questions + toggling mark

## Related

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts`
