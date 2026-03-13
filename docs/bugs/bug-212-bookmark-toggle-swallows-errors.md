# BUG-212: Bookmark Toggle Drops Failure Context at the Hook Boundary

**Status:** Open
**Priority:** P3 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

`toggleBookmarkForQuestion()` collapses both thrown failures and structured controller failures into the same generic user message, but unlike nearby async helpers it provides no local logging hook. The thrown-error path in particular drops the original cause entirely.

## Impact

- Client-side transport failures and `withTimeout(...)` failures can disappear with no client-side log.
- Structured controller failures (`res.ok === false`) are also reduced to the same generic UI message with no local diagnostic context.
- Unknown server exceptions are still logged upstream by `createAction(...)` / `handleError(...)`, so the current bug is a **partial observability gap**, not total loss of monitoring for every failure class.

## Verification Notes

1. **The local swallow is real.** `app/(app)/app/practice/practice-page-logic.ts:180-199` catches thrown failures, ignores the caught value at `189`, and maps both the catch path and the `!res.ok` path to the same generic bookmark error message.
2. **Thrown failures can originate locally.** `lib/with-timeout.ts:10-15` raises `TimeoutError` on client-side timeout, and a failed server-action invocation can also throw transport/runtime errors before any structured `ActionResult` is returned.
3. **Nearby helpers already use a better pattern.** `app/(app)/app/practice/practice-page-bookmarks.ts:38-40` and `62-70`, `app/(app)/app/practice/practice-page-tags.ts:20-31`, and `app/(app)/app/practice/practice-page-available-count.ts:39-54` all call `logError(...)` on both thrown failures and `!res.ok` results before setting UI error state.
4. **The bookmark hook only logs the load effect, not toggle failures.** `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts:45-53` passes a `console.error(...)` logger into `createBookmarksEffect(...)`, but `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts:69-101` wires `toggleBookmarkForQuestion(...)` with only UI callbacks and no logging callback.
5. **The current doc's "zero observability for all server errors" claim was too broad.** `src/adapters/controllers/action-result.ts:51-60` logs unknown controller errors on the server before returning `INTERNAL_ERROR`. But `src/adapters/controllers/action-result.ts:38-49` does **not** log expected `ApplicationError` / `ZodError` results, so those can still become silent generic bookmark failures at the client helper layer.
6. **Existing tests only lock in the generic UI behavior.** `app/(app)/app/practice/practice-page-logic.test.ts:844-885` asserts the error message and status transitions, but there is no coverage requiring the helper to preserve or log the underlying cause.

## Precise TDD Fix

1. Add failing unit tests in `app/(app)/app/practice/practice-page-logic.test.ts` proving `toggleBookmarkForQuestion(...)` logs the original thrown error and logs `res.error` on the structured `!res.ok` path while preserving the current generic user-facing message.
2. Add an optional `logError?: (message: string, context: unknown) => void` callback to `toggleBookmarkForQuestion(...)`.
3. Call `logError('Failed to toggle bookmark', error)` in the catch branch and `logError('Failed to toggle bookmark', res.error)` in the `!res.ok` branch before updating UI state.
4. Thread that callback from `usePracticeQuestionBookmarks(...)`, using the same `console.error(...)` style already used for the bookmark-load effect.
