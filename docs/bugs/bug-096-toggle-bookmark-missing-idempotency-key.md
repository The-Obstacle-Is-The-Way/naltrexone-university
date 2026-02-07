# BUG-096: `toggleBookmark` Missing Idempotency Key

**Status:** Open
**Priority:** P4
**Date:** 2026-02-07

---

## Description

The `toggleBookmark` server action does not use the `withIdempotency` wrapper. Because it is a toggle operation (add if not bookmarked, remove if bookmarked), a network-retry scenario can cause the bookmark to be toggled twice, resulting in no net change — the user thinks they bookmarked a question but it silently unbookmarked on the retry.

## Root Cause

`src/adapters/controllers/bookmark-controller.ts:61-81`:

```typescript
export const toggleBookmark = createAction({
  schema: ToggleBookmarkInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    const rate = await d.rateLimiter.limit({
      key: `bookmark:toggleBookmark:${userId}`,
      ...BOOKMARK_MUTATION_RATE_LIMIT,
    });
    if (!rate.success) {
      throw new ApplicationError(
        'RATE_LIMITED',
        `Too many bookmark changes. Try again in ${rate.retryAfterSeconds}s.`,
      );
    }
    return d.toggleBookmarkUseCase.execute({
      userId,
      questionId: input.questionId,
    });
  },
});
```

No `idempotencyKey` field in schema, no `withIdempotency` wrapper.

## Mitigating Factors

- **Rate limiting** is in place (`BOOKMARK_MUTATION_RATE_LIMIT`), which reduces rapid duplicate request risk
- **DB-level safety** — `DrizzleBookmarkRepository.add()` uses `onConflictDoNothing()`, making individual add/remove operations idempotent at the database level
- **No data corruption** — worst case is a confused UX (bookmark appears toggled back)

## Impact

- User clicks bookmark icon → network drops after server processes → client retries → bookmark is toggled back to original state
- User sees "bookmarked" confirmation but question is actually not bookmarked
- Rare in practice due to rate limiting, but possible on slow/unreliable networks

## Proposed Fix

Either:
1. Add `idempotencyKey` to `ToggleBookmarkInputSchema` and wrap with `withIdempotency`, or
2. Change the API from toggle to explicit `addBookmark` / `removeBookmark` actions with idempotency keys

Option 2 is architecturally cleaner but requires more changes. Option 1 is simpler.

## Verification

- [ ] Duplicate bookmark requests with same key produce same result
- [ ] Rate limiting still works alongside idempotency
- [ ] Existing bookmark tests still pass

## Related

- BUG-091 (`endPracticeSession` missing idempotency — same pattern)
- BUG-095 (`setPracticeSessionQuestionMark` missing idempotency — same pattern)
- `src/adapters/controllers/bookmark-controller.ts`
- `src/adapters/shared/with-idempotency.ts`
- `app/(app)/app/practice/practice-page-bookmarks.ts` (UI call site)
- `app/(app)/app/bookmarks/page.tsx` (`removeBookmarkAction` also lacks idempotency)
