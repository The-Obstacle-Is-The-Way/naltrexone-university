# BUG-089: Bookmark Loading Effect Missing Loading State

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

The `createBookmarksEffect` function in `practice-page-bookmarks.ts` never sets `bookmarkStatus` to `'loading'` before starting the async bookmark fetch. The status stays `'idle'` during the entire fetch, then jumps to `'error'` or back to `'idle'` on completion.

This is inconsistent with `toggleBookmarkForQuestion` in `practice-page-logic.ts`, which correctly sets `'loading'` before its async call.

## Steps to Reproduce

1. Navigate to `/app/practice` or start a practice session
2. Observe that bookmark status is `'idle'` while bookmarks are actively loading
3. Any UI element gated on `bookmarkStatus === 'loading'` will not show during the fetch

## Root Cause

`app/(app)/app/practice/practice-page-bookmarks.ts:39-86` — the async IIFE starts fetching immediately but never calls `input.setBookmarkStatus('loading')` before the `await`:

```typescript
void (async () => {
  // Missing: input.setBookmarkStatus('loading');
  let res: ActionResult<{ rows: Array<{ questionId: string }> }>;
  try {
    res = await input.getBookmarksFn({});
  } catch (error) {
    // ...sets 'error'
  }
  // ...sets 'idle'
})();
```

## Impact

- Bookmark loading indicator never appears during initial fetch
- UI shows stale `'idle'` state while network request is in flight
- Inconsistent with the toggle-bookmark flow which correctly shows loading

## Proposed Fix

Add `input.setBookmarkStatus('loading')` as the first statement inside the IIFE, before the `await`.

## Verification

- [ ] Bookmark status transitions: `idle` → `loading` → `idle` (success) or `error` (failure)
- [ ] Toggle bookmark still shows loading state correctly
- [ ] Unit test covers the loading transition

## Related

- `app/(app)/app/practice/practice-page-logic.ts` (toggleBookmarkForQuestion — correct pattern)
- CodeRabbit PR #68 review
