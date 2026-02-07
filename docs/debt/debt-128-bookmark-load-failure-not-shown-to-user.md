# DEBT-128: Bookmark Load Failure Not Visible to User Until Interaction

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

When bookmark loading fails, `bookmarkStatus` is set to `'error'` and retries up to 2 times. After all retries exhaust, no error message is displayed on the UI until the user clicks the bookmark button — then they see "Bookmarks unavailable."

The bookmark button appears enabled and clickable, but clicking it reveals a failure that happened during page load.

## Impact

- Users don't know bookmarks failed to load
- Confusing UX: button appears functional but reveals error only on click

## Affected Files

- `app/(app)/app/practice/components/practice-view.tsx` — Error display only after interaction
- `app/(app)/app/practice/practice-page-logic.ts:126-207` — `createBookmarksEffect` retry logic

## Resolution

Show a non-intrusive warning banner when bookmark loading fails after all retries. Optionally add a "Retry" button.

## Verification

- [ ] Warning visible when bookmarks fail to load
- [ ] Doesn't block question answering flow

## Related

- `app/(app)/app/practice/practice-page-logic.ts`
