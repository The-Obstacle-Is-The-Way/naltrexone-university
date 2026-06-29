# BUG-264: Stale Remove-Bookmark Surfaces Can Re-Add the Bookmark

**Status:** Open
**Resolution State:** Fix implemented; awaiting review + prod-verify.
**Severity:** P4
**Date:** 2026-06-29
**Confirmed:** 2026-06-29
**Component:** Bookmarks / Stale UI State / Idempotency Semantics

---

## Summary

The bookmark mutation is still modeled as a state toggle, even on UI surfaces that present a concrete "Remove bookmark" intent. If the same bookmarked question is open in two stale surfaces, each surface has its own idempotency key and both buttons truthfully show "Remove bookmark." The first request removes the bookmark. The second request reaches the server after the row is gone, so the toggle use case treats it as an add and re-creates the bookmark.

This is distinct from BUG-231: same-key duplicate submits are replay-safe now. The remaining gap is independent stale remove intents from separate rendered surfaces, tabs, or reloads with different idempotency keys.

## Reachability

Reachable by an entitled user who has the same bookmarked question visible in two places, for example:

1. Open `/app/bookmarks` in two tabs, or open `/app/bookmarks` plus a review/practice surface for the same already-bookmarked question.
2. Both surfaces render a "Remove bookmark" control from their local hydrated state.
3. Click/confirm remove on the first surface.
4. Click/confirm remove on the second stale surface without refreshing it.

Expected: both user actions express the same remove intent, so the final server truth should be unbookmarked.

Actual: the second request toggles the now-absent row back on. On the bookmarks page action, `bookmarked: true` redirects with `?error=remove_failed`; in-place practice/review controls can show the "Question bookmarked." success message even though the clicked button said "Remove bookmark."

## Ground-Truth Proof

A one-off use-case reproduction against the current `origin/dev` tree produced this output:

```json
{
  "first": {
    "bookmarked": false
  },
  "existsAfterFirst": false,
  "second": {
    "bookmarked": true
  },
  "existsAfterSecond": true
}
```

Command shape:

```bash
pnpm exec tsx -e "import { FakeBookmarkRepository, FakeQuestionRepository } from './src/application/test-helpers/fakes'; import { ToggleBookmarkUseCase } from './src/application/use-cases/toggle-bookmark'; import { createQuestion } from './src/domain/test-helpers'; async function main(){ /* seed existing bookmark, execute twice */ } void main();"
```

The first execution represents the first stale remove surface. The second execution represents another independently keyed stale remove surface after the first has removed the row.

## Root Cause

Remove-intent UI surfaces still call the generic toggle controller:

- [`bookmarks/page.tsx`](<../../app/(app)/app/bookmarks/page.tsx#L56>) renders a remove form with `removeBookmarkAction`.
- [`bookmarks/page.tsx`](<../../app/(app)/app/bookmarks/page.tsx#L80>) submits that form from a destructive "Remove bookmark" dialog action.
- [`bookmarks-actions.ts`](<../../app/(app)/app/bookmarks/bookmarks-actions.ts#L25>) reads the rendered idempotency key.
- [`bookmarks-actions.ts`](<../../app/(app)/app/bookmarks/bookmarks-actions.ts#L28>) calls `toggleBookmarkFn({ questionId, idempotencyKey })`.
- [`bookmarks-actions.ts`](<../../app/(app)/app/bookmarks/bookmarks-actions.ts#L33>) treats a `bookmarked: true` result as `remove_failed`, proving the action expected a removal.

The in-place review/practice surfaces have the same stale remove-intent shape:

- [`question-page-client.tsx`](<../../app/(app)/app/questions/[slug]/question-page-client.tsx#L441>) renders the review-mode bookmark button.
- [`question-page-client.tsx`](<../../app/(app)/app/questions/[slug]/question-page-client.tsx#L450>) labels an already-bookmarked question as "Remove bookmark."
- [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L188>) renders the tutor/quick-practice feedback bookmark button.
- [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L200>) likewise labels an already-bookmarked question as "Remove bookmark."

Each independently rendered surface has its own idempotency key lifecycle:

- [`bookmark-toggle.ts`](<../../app/(app)/app/shared/bookmark-toggle.ts#L33>) reuses the current surface's stored key or creates one.
- [`bookmark-toggle.ts`](<../../app/(app)/app/shared/bookmark-toggle.ts#L45>) sends that key to the server action.
- [`use-question-page-bookmarks.ts`](<../../app/(app)/app/questions/[slug]/hooks/use-question-page-bookmarks.ts#L175>) wires the question page to the shared helper with a per-hook `Map`.
- [`use-practice-question-bookmarks.ts`](<../../app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts#L76>) does the same for practice flows.
- [`execute-idempotent.ts`](../../src/adapters/controllers/shared/execute-idempotent.ts#L42) scopes replay to the supplied idempotency key, so two different stale surfaces execute independently.

The application use case is a toggle, not an idempotent desired-state write:

- [`toggle-bookmark.ts`](../../src/application/use-cases/toggle-bookmark.ts#L23) first tries to remove the `(userId, questionId)` bookmark.
- [`toggle-bookmark.ts`](../../src/application/use-cases/toggle-bookmark.ts#L27) returns `bookmarked: false` only when a row was removed.
- [`toggle-bookmark.ts`](../../src/application/use-cases/toggle-bookmark.ts#L29) falls through to the add path when no row exists.
- [`toggle-bookmark.ts`](../../src/application/use-cases/toggle-bookmark.ts#L34) adds the bookmark and returns `bookmarked: true`.

The repository correctly scopes rows to the user, but that correctness also proves the stale remove request is operating on the same user's real bookmark state:

- [`drizzle-bookmark-repository.ts`](../../src/adapters/repositories/drizzle-bookmark-repository.ts#L41) deletes by `userId` and `questionId`.
- [`drizzle-bookmark-repository.ts`](../../src/adapters/repositories/drizzle-bookmark-repository.ts#L49) returns whether a row was deleted.
- [`drizzle-bookmark-repository.ts`](../../src/adapters/repositories/drizzle-bookmark-repository.ts#L20) adds the same `(userId, questionId)` pair back when no row exists.

## Impact

A user can perform the same visible "Remove bookmark" action twice from stale surfaces and end with the bookmark still present. The UI can also show contradictory feedback: the bookmarks page can report remove failure, while in-place controls can show "Question bookmarked." after the user clicked a button labeled "Remove bookmark."

No cross-user access, score corruption, or data loss is involved. The user can recover by clicking remove again from a fresh surface, so this is P4.

## Proposed Fix

Introduce an intent-specific bookmark write path instead of using toggle for destructive remove surfaces:

1. Add an application use case and controller action that sets a desired bookmark state, or at minimum a `removeBookmark` action whose success is idempotent when the row is already absent.
2. Route `/app/bookmarks` removal through the remove-specific action.
3. For in-place controls, either send the desired state derived from the clicked UI label (`bookmarked: false` for "Remove bookmark", `true` for "Bookmark") or revalidate server state before applying a stale toggle.
4. Keep the existing toggle path only where the UI intentionally means "invert current server state."

Rejected alternative: sharing idempotency keys across tabs. That cannot cover separate rendered surfaces, reloads, or independent forms, and it still leaves the server API unable to express remove idempotently.

## Failing Test Sketch

```typescript
it('does not re-add a bookmark when two stale remove intents execute independently', async () => {
  const userId = 'user-1';
  const questionId = 'q1';
  const bookmarks = new FakeBookmarkRepository([
    { userId, questionId, createdAt: new Date('2026-02-01T00:00:00Z') },
  ]);
  const questions = new FakeQuestionRepository([
    createQuestion({ id: questionId, status: 'published' }),
  ]);
  const removeBookmark = new RemoveBookmarkUseCase(bookmarks, questions);

  await expect(removeBookmark.execute({ userId, questionId })).resolves.toEqual({
    bookmarked: false,
  });
  await expect(removeBookmark.execute({ userId, questionId })).resolves.toEqual({
    bookmarked: false,
  });
  await expect(bookmarks.exists(userId, questionId)).resolves.toBe(false);
});
```

Today the equivalent behavior through `ToggleBookmarkUseCase` fails because the second call returns `{ bookmarked: true }` and leaves the bookmark present.

## Prior Bug Cross-Refs

- BUG-096 added controller-level bookmark idempotency for same-key replays.
- BUG-231 fixed the bookmarks page remove form's missing idempotency key, so duplicate submits of the same rendered form no longer re-toggle state.
- BUG-259 fixed cached rate-limit errors for in-place bookmark actions.
- BUG-264 is the remaining different-key stale-surface problem: the mutation still cannot express "remove this bookmark" idempotently.
