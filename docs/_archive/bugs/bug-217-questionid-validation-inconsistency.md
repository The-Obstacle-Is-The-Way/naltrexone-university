# BUG-217: `getPreviousAttempt` Accepts Non-UUID `questionId` Values

**Status:** Resolved
**Priority:** P3 (narrowed after verification)
**Date:** 2026-03-13
**Resolved:** 2026-03-14 (PR #213)

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
4. **The looser value flows deeper into the application/repository path.** `src/adapters/controllers/question-view-controller.ts:121-129` forwards `input.questionId` unchanged into `GetPreviousAttemptUseCase.execute(...)`.
5. **The real persistence layer is UUID-backed.** `db/schema.ts:243-245` defines `questions.id` as a UUID primary key, `db/schema.ts:374-376` defines `attempts.questionId` as a UUID foreign key.

## Resolution

Schema changed from `z.string().min(1)` to `zUuid`. Master spec (`docs/specs/master_spec.md`) updated to match. All existing tests updated from placeholder `q1` values to proper UUIDs. New test confirms `'not-a-uuid'` returns `VALIDATION_ERROR` without calling the use case.
