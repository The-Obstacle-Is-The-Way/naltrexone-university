# BUG-033: Stale Closure in onToggleBookmark

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The `onToggleBookmark` function captures `question` from the closure. If the question changes (via `loadNext()`) between the initial check and the state updater callback, the wrong question will be bookmarked/unbookmarked.

## Location

- `app/(app)/app/practice/page.tsx:281-301`

## Root Cause

The `question.questionId` was accessed inside the state updater callback, but `question` could have changed during the async `toggleBookmark` call.

## Fix

Capture `questionId` at the start of the function before any async operations:

```typescript
async function onToggleBookmark() {
  if (!question) return;

  const questionId = question.questionId;  // Capture before async

  setBookmarkStatus('loading');

  const res = await toggleBookmark({ questionId });
  if (!res.ok) {
    setBookmarkStatus('error');
    setLoadState({ status: 'error', message: getErrorMessage(res) });
    return;
  }

  setBookmarkedQuestionIds((prev) => {
    const next = new Set(prev);
    if (res.data.bookmarked) next.add(questionId);  // Use captured value
    else next.delete(questionId);  // Use captured value
    return next;
  });

  setBookmarkStatus('idle');
}
```

## Verification

- [x] Code review verified pattern correctness
- [x] TypeScript compilation passes
- [x] Build succeeds

## Related

- BUG-032: State update after unmount
- [React docs on closures](https://react.dev/learn/state-as-a-snapshot)
