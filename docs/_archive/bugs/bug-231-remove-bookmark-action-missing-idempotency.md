# BUG-231: Remove Bookmark Form Action Is Not Idempotent and Can Re-Add the Bookmark

**Status:** Open
**Priority:** P4
**Date:** 2026-04-03
**Confirmed:** 2026-04-03
**Component:** Bookmarks / Server Actions

---

## Description

The bookmarks page renders a dedicated "Remove bookmark" form action, but that action still calls the bookmark toggle controller without an `idempotencyKey`.

As a result, duplicate form submissions are not replay-safe:

- the first submit removes the bookmark
- a second submit with the same intent toggles it back on
- the action then interprets `bookmarked: true` as `remove_failed`

Observed behavior:

- A double-submit or replayed POST can leave the bookmark still present after the user confirmed removal.
- The final redirect can surface `?error=remove_failed` even though the first request already removed the bookmark momentarily.

Expected behavior:

- "Remove bookmark" should be idempotent at the page-action boundary.
- Duplicate submits of the same removal intent should replay the same successful removal result instead of re-toggling state.

## Impact

- Confirmed destructive-intent form posts are replay-unsafe.
- Slow clicks, double-clicks, browser retries, or manual request replays can leave bookmark state opposite from the user's intent.
- The controller already supports idempotency, so this is a boundary gap rather than a missing platform capability.

## Steps to Reproduce

1. Open `/app/bookmarks` with at least one bookmarked question.
2. Trigger the remove-bookmark confirmation for a row.
3. Submit the same removal twice in quick succession, or replay the same server-action request.
4. Observe one request remove the bookmark and the later request toggle it back on.
5. Observe the final redirect can land on `?error=remove_failed`, with the bookmark still present.

## Root Cause

Tracer-bullet path:

1. [`app/(app)/app/bookmarks/page.tsx`](../../app/(app)/app/bookmarks/page.tsx) renders `<form action={removeBookmarkAction}>` with only `questionId` as hidden input.
2. [`app/(app)/app/bookmarks/bookmarks-actions.ts`](../../app/(app)/app/bookmarks/bookmarks-actions.ts) reads that `questionId` and calls `toggleBookmarkFn({ questionId })`.
3. [`src/adapters/controllers/bookmark-controller.ts`](../../src/adapters/controllers/bookmark-controller.ts) only enters `withIdempotency(...)` when callers supply `idempotencyKey`.
4. Without an idempotency key, duplicate submits execute the raw toggle path twice.
5. The current page test in [`app/(app)/app/bookmarks/page.test.tsx`](../../app/(app)/app/bookmarks/page.test.tsx) explicitly asserts the no-idempotency contract by expecting `toggleBookmarkFn` to be called with only `{ questionId: 'q_1' }`.
6. This is a page-action follow-up to BUG-096: controller-level bookmark idempotency exists, but the bookmarks removal form still bypasses it.

## Recommended Fix

- Add a hidden idempotency-key field to the bookmarks removal form.
- Parse and validate that key in `removeBookmarkAction(...)`.
- Forward the key to `toggleBookmark(...)` so duplicate submits replay the original removal result.
- Add regression coverage proving that two identical removal submissions with the same key do not re-add the bookmark.

## Verification

- [x] Code-level tracer-bullet verified on 2026-04-03.
- [x] Existing page tests cover success/error redirects but do not cover duplicate-submit replay safety.
- [ ] Add regression coverage for duplicate remove submissions using the same idempotency key.
- [ ] Manual browser repro with a throttled network or replayed server-action request.

## Related

- [`app/(app)/app/bookmarks/page.tsx`](../../app/(app)/app/bookmarks/page.tsx)
- [`app/(app)/app/bookmarks/bookmarks-actions.ts`](../../app/(app)/app/bookmarks/bookmarks-actions.ts)
- [`app/(app)/app/bookmarks/page.test.tsx`](../../app/(app)/app/bookmarks/page.test.tsx)
- [`src/adapters/controllers/bookmark-controller.ts`](../../src/adapters/controllers/bookmark-controller.ts)
- [`docs/_archive/bugs/bug-096-toggle-bookmark-missing-idempotency-key.md`](../_archive/bugs/bug-096-toggle-bookmark-missing-idempotency-key.md)
