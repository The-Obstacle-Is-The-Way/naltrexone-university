# BUG-212: Bookmark Toggle Catch Block Swallows Error Without Logging

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

In `practice-page-logic.ts:189`, the bookmark toggle catch block discards the caught error `_error` entirely. Network errors, server errors, timeout errors, and validation errors all produce the same generic user message (`"Failed to save bookmark. Please try again."`) with zero observability -- no server log, no client log, no error reporting.

## Impact

- Production bookmark failures are invisible to monitoring.
- Cannot distinguish between transient network issues and persistent server bugs.
- The leading underscore `_error` confirms the value is intentionally unused.

## Location

- `app/(app)/app/practice/practice-page-logic.ts:189-194`

## Suggested Fix

Log the error before showing the user message:

```typescript
} catch (error) {
  if (!isMounted()) return;
  console.error('Bookmark toggle failed:', error);
  input.onBookmarkError?.('Failed to save bookmark. Please try again.');
  input.setBookmarkStatus('error');
  return;
}
```

Or better, pass the error to a logging callback consistent with `createBookmarksEffect` and `createTagsEffect` patterns elsewhere.

## Prevention

- Catch blocks that show user-facing error messages should also log the underlying error.
