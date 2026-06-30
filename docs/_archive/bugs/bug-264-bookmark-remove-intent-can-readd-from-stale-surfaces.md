# BUG-264: Stale Remove-Bookmark Surfaces Can Re-Add the Bookmark

**Status:** Resolved
**Severity:** P4
**Date:** 2026-06-29
**Confirmed:** 2026-06-29
**Resolved:** 2026-06-30
**Component:** Bookmarks / Stale UI State / Idempotency Semantics

---

## Resolution

Fixed by replacing the bookmark **toggle** mutation with an idempotent **desired-state** write.

The application use case `src/application/use-cases/toggle-bookmark.ts` was renamed and reimplemented as [`set-bookmark.ts`](../../../src/application/use-cases/set-bookmark.ts) (`SetBookmarkUseCase`, input `{ userId, questionId, bookmarked }`): when `bookmarked` is `false` it removes idempotently (no published-question check, so unavailable bookmarks stay removable); when `true` it short-circuits if the bookmark already exists, otherwise validates the question is published (`NOT_FOUND` if not) and adds. Add and remove are now idempotent in both directions, so two independently keyed stale "Remove bookmark" intents both converge to *unbookmarked* instead of the second one re-adding.

The controller action [`bookmark-controller.ts`](../../../src/adapters/controllers/bookmark-controller.ts) became `setBookmark` (`{ questionId, bookmarked, idempotencyKey }`, idempotency action `bookmark:setBookmark`), preserving the entitlement gate, the rate-limit `beforeExecute` hook, and the idempotency-replay fencing. The bookmarks-page server action and the in-place practice/review surfaces now send explicit bookmark **intent** (`bookmarked: !isBookmarked`, derived from the rendered label) instead of a blind toggle; the now-impossible `remove_failed`-on-`bookmarked:true` branch and the `toggle_failed` error code were removed. The repository and its port were unchanged — both `add` (`onConflictDoUpdate`) and `remove` (returns `false` when already absent) were already idempotent.

TDD: a new `set-bookmark.test.ts` was red before the implementation (the two-stale-remove case returned `{ bookmarked: true }` and left the row present) and green after — covering idempotent remove, already-absent remove, the two-independent-stale-removes regression, add idempotency, published-on-add (`NOT_FOUND`), and remove-of-an-unavailable bookmark. Full unit/component/browser suites (3032 tests) + build green.

Shipped via PR #540 (squash `ca17b5f6` on `dev`) → promoted via PR #541 (merge `72dd2aff` on `main`). Production deploy `dpl_22bpJvPoiZWKHZFPj6Dw1JioqdaG` (`72dd2aff`, target production) verified READY; `addictionboards.com` HTTP 200, `/api/health` 200. CodeRabbit substantively reviewed #540; its one residual thread (UUID-ify the fake-backed `set-bookmark.test.ts` fixture IDs) was a **verified false positive** against `.claude/rules/fixture-integrity.md` (fakes-only application test with no `zUuid`/Drizzle boundary; the real boundary is covered with UUID fixtures in `bookmark-controller.test.ts`) and was resolved with documented rationale. The #541 promo CR was rate-limited; merged on proven tree-identity (`dev` tree == promo tree `67d3986e`) plus the green ruleset `test` check and owner authorization.

---

## Summary

The bookmark mutation was modeled as a state toggle, even on UI surfaces that present a concrete "Remove bookmark" intent. If the same bookmarked question is open in two stale surfaces, each surface has its own idempotency key and both buttons truthfully show "Remove bookmark." The first request removes the bookmark. The second request reaches the server after the row is gone, so the toggle use case treats it as an add and re-creates the bookmark.

This is distinct from BUG-231: same-key duplicate submits are replay-safe. The remaining gap was independent stale remove intents from separate rendered surfaces, tabs, or reloads with different idempotency keys.

## Reachability

Reachable by an entitled user who has the same bookmarked question visible in two places, for example:

1. Open `/app/bookmarks` in two tabs, or open `/app/bookmarks` plus a review/practice surface for the same already-bookmarked question.
2. Both surfaces render a "Remove bookmark" control from their local hydrated state.
3. Click/confirm remove on the first surface.
4. Click/confirm remove on the second stale surface without refreshing it.

Expected: both user actions express the same remove intent, so the final server truth should be unbookmarked.

Actual (pre-fix): the second request toggled the now-absent row back on. On the bookmarks page action, `bookmarked: true` redirected with `?error=remove_failed`; in-place practice/review controls could show the "Question bookmarked." success message even though the clicked button said "Remove bookmark."

## Ground-Truth Proof

A one-off use-case reproduction against the pre-fix tree produced this output:

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

The first execution represents the first stale remove surface. The second execution represents another independently keyed stale remove surface after the first has removed the row.

## Root Cause

Remove-intent UI surfaces called the generic toggle controller:

- [`bookmarks/page.tsx`](<../../../app/(app)/app/bookmarks/page.tsx#L56>) renders a remove form with `removeBookmarkAction`.
- [`bookmarks/page.tsx`](<../../../app/(app)/app/bookmarks/page.tsx#L80>) submits that form from a destructive "Remove bookmark" dialog action.
- [`bookmarks-actions.ts`](<../../../app/(app)/app/bookmarks/bookmarks-actions.ts#L25>) reads the rendered idempotency key.
- [`bookmarks-actions.ts`](<../../../app/(app)/app/bookmarks/bookmarks-actions.ts#L28>) called the bookmark mutation (pre-fix `toggleBookmarkFn`).
- [`bookmarks-actions.ts`](<../../../app/(app)/app/bookmarks/bookmarks-actions.ts#L33>) treated a `bookmarked: true` result as `remove_failed`, proving the action expected a removal.

The in-place review/practice surfaces had the same stale remove-intent shape:

- [`question-page-client.tsx`](<../../../app/(app)/app/questions/[slug]/question-page-client.tsx#L441>) renders the review-mode bookmark button.
- [`question-page-client.tsx`](<../../../app/(app)/app/questions/[slug]/question-page-client.tsx#L450>) labels an already-bookmarked question as "Remove bookmark."
- [`practice-view.tsx`](<../../../app/(app)/app/practice/components/practice-view.tsx#L188>) renders the tutor/quick-practice feedback bookmark button.
- [`practice-view.tsx`](<../../../app/(app)/app/practice/components/practice-view.tsx#L200>) likewise labels an already-bookmarked question as "Remove bookmark."

Each independently rendered surface has its own idempotency key lifecycle:

- [`bookmark-toggle.ts`](<../../../app/(app)/app/shared/bookmark-toggle.ts#L33>) reuses the current surface's stored key or creates one.
- [`bookmark-toggle.ts`](<../../../app/(app)/app/shared/bookmark-toggle.ts#L45>) sends that key to the server action.
- [`use-question-page-bookmarks.ts`](<../../../app/(app)/app/questions/[slug]/hooks/use-question-page-bookmarks.ts#L175>) wires the question page to the shared helper with a per-hook `Map`.
- [`use-practice-question-bookmarks.ts`](<../../../app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts#L76>) does the same for practice flows.
- [`execute-idempotent.ts`](../../../src/adapters/controllers/shared/execute-idempotent.ts#L42) scopes replay to the supplied idempotency key, so two different stale surfaces execute independently.

The application use case was a toggle, not an idempotent desired-state write (pre-fix `toggle-bookmark.ts`, since replaced by `set-bookmark.ts` — see Resolution):

- `toggle-bookmark.ts` first tried to remove the `(userId, questionId)` bookmark.
- It returned `bookmarked: false` only when a row was removed.
- It fell through to the add path when no row existed.
- It added the bookmark and returned `bookmarked: true`.

The repository correctly scopes rows to the user, which also proves the stale remove request operated on the same user's real bookmark state:

- [`drizzle-bookmark-repository.ts`](../../../src/adapters/repositories/drizzle-bookmark-repository.ts#L41) deletes by `userId` and `questionId`.
- [`drizzle-bookmark-repository.ts`](../../../src/adapters/repositories/drizzle-bookmark-repository.ts#L49) returns whether a row was deleted.
- [`drizzle-bookmark-repository.ts`](../../../src/adapters/repositories/drizzle-bookmark-repository.ts#L20) adds the same `(userId, questionId)` pair back when no row exists.

## Impact

A user could perform the same visible "Remove bookmark" action twice from stale surfaces and end with the bookmark still present. The UI could also show contradictory feedback: the bookmarks page could report remove failure, while in-place controls could show "Question bookmarked." after the user clicked a button labeled "Remove bookmark."

No cross-user access, score corruption, or data loss was involved. The user could recover by clicking remove again from a fresh surface, so this was P4.

## Proposed Fix (as planned; see Resolution for what shipped)

Introduce an intent-specific bookmark write path instead of using toggle for destructive remove surfaces:

1. Add an application use case and controller action that sets a desired bookmark state, or at minimum a `removeBookmark` action whose success is idempotent when the row is already absent.
2. Route `/app/bookmarks` removal through the remove-specific action.
3. For in-place controls, send the desired state derived from the clicked UI label (`bookmarked: false` for "Remove bookmark", `true` for "Bookmark").
4. Keep the existing toggle path only where the UI intentionally means "invert current server state."

Rejected alternative: sharing idempotency keys across tabs. That cannot cover separate rendered surfaces, reloads, or independent forms, and it still leaves the server API unable to express remove idempotently.

## Failing Test Sketch (became the shipped regression test)

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
  const setBookmark = new SetBookmarkUseCase(bookmarks, questions);

  await expect(
    setBookmark.execute({ userId, questionId, bookmarked: false }),
  ).resolves.toEqual({ bookmarked: false });
  await expect(
    setBookmark.execute({ userId, questionId, bookmarked: false }),
  ).resolves.toEqual({ bookmarked: false });
  await expect(bookmarks.exists(userId, questionId)).resolves.toBe(false);
});
```

Pre-fix, the equivalent behavior through `ToggleBookmarkUseCase` failed because the second call returned `{ bookmarked: true }` and left the bookmark present.

## Prior Bug Cross-Refs

- BUG-096 added controller-level bookmark idempotency for same-key replays.
- BUG-231 fixed the bookmarks page remove form's missing idempotency key, so duplicate submits of the same rendered form no longer re-toggle state.
- BUG-259 fixed cached rate-limit errors for in-place bookmark actions.
- BUG-264 closed the remaining different-key stale-surface problem: the mutation now expresses "remove this bookmark" idempotently via desired-state writes.
