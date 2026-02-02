# BUG-019: Missing Bookmarks View Page — Users Can Bookmark But Can't View

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

Users could bookmark questions during practice, but there was no UI to view or manage bookmarked questions.

## Root Cause

The bookmark controller and repository existed, but there was no `/app/bookmarks` route and no navigation entry pointing to it.

## Fix

1. Added `/app/bookmarks` page that calls `getBookmarks({})` and renders the list.
2. Added a "Remove" action per bookmark (server action calling `toggleBookmark` + `revalidatePath`).
3. Added navigation link to `/app/bookmarks` (desktop + mobile nav).
4. Added render-output unit tests for the new page.

## Verification

- [x] Unit tests added (`app/(app)/app/bookmarks/page.test.tsx`)
- [x] `pnpm test --run`

## Related

- `src/adapters/controllers/bookmark-controller.ts`
- `app/(app)/app/practice/page.tsx` — current bookmark toggle
- SPEC-014: Review and Bookmarks
