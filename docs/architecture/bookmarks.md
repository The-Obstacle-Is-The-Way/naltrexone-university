# Bookmark State Ownership

The shared mutation helper lives in `app/(app)/app/shared/bookmark-toggle.ts`; practice and review page models retain their own state and hydration. The [surface policy](../design-system/bookmark-surfaces.md) owns where bookmarks appear.

## Why the Mutation Is Shared

- It removes the question review page's dependency on the practice route module
- It avoids a god-hook that tries to own both practice-set state and review-page state
- It fixes the idempotency retry hole in one place shared by both consumers
- Review hydration now uses `getBookmarkStatus({ questionId })` in `use-question-page-bookmarks.ts`. This supersedes the former client-side filtering of `getBookmarks({})`; the separate hydration owner still avoids coupling review-page state to the practice route.

