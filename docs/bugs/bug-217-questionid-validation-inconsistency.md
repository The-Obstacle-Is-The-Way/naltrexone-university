# BUG-217: `getPreviousAttempt` Accepts Non-UUID `questionId` Values

**Status:** Open
**Priority:** P3 (narrowed after verification)
**Date:** 2026-03-13

## Summary

The original report was directionally right but incomplete. `getPreviousAttempt(...)` is the one question-id controller path that still validates `questionId` as `z.string().min(1)` instead of `zUuid`. That inconsistency is not just local drift: the current master spec for `GetPreviousAttemptInputSchema` also encodes `z.string().min(1)`. The verified bug is therefore a spec-and-controller contract problem: malformed non-UUID `questionId` values bypass the controller boundary and are rejected later, deeper in the review-hydration stack.

## Impact

- Malformed `questionId` values are not rejected as `VALIDATION_ERROR` at the controller boundary.
- The real production path queries UUID-backed database columns, so malformed values are rejected later and less cleanly.
- This is not a SQL injection issue; it is a boundary-consistency and error-classification bug.

## Verification Notes

Tracer-bullet verification changed the root cause slightly:

1. **The controller really is looser here.** `src/adapters/controllers/question-view-controller.ts:101-116` defines `GetPreviousAttemptInputSchema` with `questionId: z.string().min(1)` while keeping `attemptId` and `sessionId` on `zUuid`.
2. **The current SSOT matches that looser schema.** `docs/specs/master_spec.md:1798-1800` still documents `GetPreviousAttemptInputSchema` as `questionId: z.string().min(1)`, so the problem is not just an implementation typo.
3. **Adjacent question-id controller inputs use UUID validation.** `src/adapters/controllers/question-controller.ts:58-75` uses `zUuid.optional()` for `getNextQuestion` session-mode navigation, `src/adapters/controllers/question-controller.ts:77-93` uses `zUuid` for `submitAnswer`, `src/adapters/controllers/bookmark-controller.ts:27-32` uses `zUuid` for `toggleBookmark`, and `src/adapters/controllers/practice-schemas.ts:59-66` uses `zUuid` for `setPracticeSessionQuestionMark`.
4. **The looser value flows deeper into the application/repository path.** `src/adapters/controllers/question-view-controller.ts:121-129` forwards `input.questionId` unchanged into `GetPreviousAttemptUseCase.execute(...)`. `src/application/use-cases/get-previous-attempt.ts:14-19` and `src/application/use-cases/get-previous-attempt.ts:83-107` continue treating `questionId` as an unconstrained string and pass it to repository lookups.
5. **The real persistence layer is UUID-backed.** `db/schema.ts:243-245` defines `questions.id` as a UUID primary key, `db/schema.ts:374-376` defines `attempts.questionId` as a UUID foreign key, and `db/schema.ts:435-437` defines `bookmarks.questionId` as a UUID foreign key. Inference from these sources: malformed non-UUID values are no longer stopped at validation and can only fail later in the database-backed path.
6. **The current controller tests do not protect the stricter contract.** `src/adapters/controllers/question-view-controller.test.ts:317-347` only verifies empty-string validation and mutually-exclusive `attemptId`/`sessionId`. The same test file then uses placeholder values like `q1` as accepted `questionId` inputs throughout `src/adapters/controllers/question-view-controller.test.ts:380-406`, `src/adapters/controllers/question-view-controller.test.ts:409-435`, and `src/adapters/controllers/question-view-controller.test.ts:438-689`.

## Precise TDD Fix

1. Update the SSOT in `docs/specs/master_spec.md` so `GetPreviousAttemptInputSchema` requires `questionId: zUuid`.
2. Add a failing controller test in `src/adapters/controllers/question-view-controller.test.ts` proving `{ questionId: 'not-a-uuid' }` returns `VALIDATION_ERROR` and does not call the use case.
3. Change `src/adapters/controllers/question-view-controller.ts` to validate `questionId` with `zUuid`.
4. Update the existing `getPreviousAttempt` controller tests that currently use placeholder values like `q1` so the suite exercises the stricter UUID contract instead of depending on the old permissive schema.
