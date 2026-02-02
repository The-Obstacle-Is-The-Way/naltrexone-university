# DEBT-066: No Success Toast for Bookmark Action

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

When a user bookmarked or unbookmarked a question, the only feedback was the button label changing. There was no explicit confirmation message, which made it easy to miss the success state.

## Resolution

Implemented a lightweight, dependency-free success confirmation:

- The bookmark toggle logic accepts an optional `onBookmarkToggled(bookmarked)` callback.
- The practice pages (`/app/practice` and `/app/practice/[sessionId]`) provide that callback and show a short-lived confirmation message under the bookmark button.
- The message is announced to assistive technology via `aria-live="polite"`.

This avoids introducing a toast dependency while still providing clear feedback.

## Verification

- [x] Unit tests: `toggleBookmarkForQuestion` calls `onBookmarkToggled` only on success.
- [x] Render tests: practice session page renders `bookmarkMessage` when provided.

## Related

- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/practice/page.tsx`
- `app/(app)/app/practice/[sessionId]/page.tsx`
