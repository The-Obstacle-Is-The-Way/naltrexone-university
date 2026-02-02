# BUG-018: Missing Bookmarks View Page — Users Can Bookmark But Can't View

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

Users can bookmark questions during practice, but there is no page to view their bookmarked questions. The bookmark feature is half-implemented — the backend is complete but the frontend is a dead end.

**Observed behavior:**
1. User practices questions and bookmarks some
2. User wants to review bookmarked questions
3. No "Bookmarks" page exists
4. No way to access bookmarked questions

**Expected behavior:**
- `/app/bookmarks` page showing all bookmarked questions
- Ability to practice from bookmarked questions
- Ability to remove bookmarks from the list

## Steps to Reproduce

1. Navigate to `/app/practice`
2. Answer a question and click the bookmark toggle
3. Observe: Question is bookmarked (toggle state changes)
4. Try to find a "Bookmarks" page
5. Observe: No such page exists

## Root Cause

**What exists:**
- `toggleBookmark()` server action — works ✓
- `getBookmarks()` controller method — implemented ✓
- `DrizzleBookmarkRepository` — complete ✓
- Container wiring — complete ✓

**What's missing:**
- `/app/(app)/app/bookmarks/page.tsx` — does not exist
- Navigation link to bookmarks page — does not exist
- UI to display bookmarked questions list — does not exist

The bookmark controller `getBookmarks()` is called from the practice page only to check if the current question is bookmarked. There's no dedicated view for all bookmarks.

## Fix

1. Create `/app/(app)/app/bookmarks/page.tsx`:
```typescript
export default async function BookmarksPage() {
  const bookmarks = await getBookmarks({});
  return (
    <BookmarksList bookmarks={bookmarks} />
  );
}
```

2. Add navigation link in sidebar/nav to `/app/bookmarks`

3. Create `BookmarksList` component showing:
   - Question stem preview
   - Difficulty
   - Date bookmarked
   - Remove bookmark action
   - "Practice this question" action

## Verification

- [ ] Page created at `/app/bookmarks`
- [ ] Page displays all bookmarked questions
- [ ] Can remove bookmark from list
- [ ] Can navigate to practice a specific bookmarked question
- [ ] Navigation link added to app layout
- [ ] E2E test: bookmark → view → unbookmark flow

## Related

- `src/adapters/controllers/bookmark-controller.ts`
- `app/(app)/app/practice/page.tsx` — current bookmark toggle
- SPEC-014: Review and Bookmarks
