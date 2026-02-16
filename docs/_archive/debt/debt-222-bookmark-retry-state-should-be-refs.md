# DEBT-222: Bookmark Idempotency Key Should Use `useRef` Instead of `useState`

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-16
**Resolved:** 2026-02-16
**GitHub Issue:** —

---

## Summary

`bookmarkIdempotencyKey` was stored as React state even though it never appears in rendered output. Updating it caused an unnecessary re-render and `onToggleBookmark` callback churn.

`bookmarkRetryCount` intentionally remains state because it is a `useEffect` dependency that triggers bookmark re-fetching.

## Resolution

- Converted `bookmarkIdempotencyKey` from `useState` to `useRef` in `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts`
- Kept `bookmarkRetryCount` as `useState` (effect dependency)
- Preserved existing bookmark behavior

## Tests

- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.test.tsx`

