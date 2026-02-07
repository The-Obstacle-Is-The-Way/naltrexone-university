# DEBT-128: Bookmark Load Failure Not Visible to User Until Interaction

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-07

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

Show a non-intrusive warning banner whenever `bookmarkStatus === 'error'`, even when no question card is currently rendered.

Implemented in:
- `app/(app)/app/practice/components/practice-view.tsx`

Regression coverage added in:
- `app/(app)/app/practice/page.test.tsx` (`renders bookmark warning even before a question is loaded`)

## Verification

- [x] Warning visible when bookmarks fail to load
- [x] Does not block question-answering flow

## Related

- `app/(app)/app/practice/practice-page-logic.ts`
