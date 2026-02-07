# BUG-089: Bookmark Loading Effect Missing Loading State

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

The report claimed `createBookmarksEffect` did not transition bookmark status to `loading` before fetching bookmarks.

## Root Cause

This report was stale. The current implementation already sets loading state before awaiting the network call:

- `app/(app)/app/practice/practice-page-bookmarks.ts:55`

```typescript
input.setBookmarkStatus('loading');
res = await input.getBookmarksFn({});
```

## Impact

No runtime bug existed in current `dev`; loading state behavior was already correct.

## Fix

No production code change was required for this bug. The tracker entry was closed as a stale finding and archived.

## Verification

- [x] Verified `setBookmarkStatus('loading')` runs before bookmark fetch
- [x] Confirmed fetch success/failure still transitions to `idle`/`error`
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `app/(app)/app/practice/practice-page-bookmarks.ts`
- `docs/bugs/index.md`
