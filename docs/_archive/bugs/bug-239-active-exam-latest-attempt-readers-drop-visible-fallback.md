# BUG-239: Active-Exam Latest-Attempt Readers Drop Older Visible Attempts

**Status:** Resolved (PR #290, merged 2026-04-27)
**Priority:** P4
**Date:** 2026-04-25
**Resolution State:** Fixed in PR #290, merged to dev `0bb0bbba` and main on 2026-04-27.
**Confirmed:** 2026-04-25
**Component:** Practice / Review Hydration / Question Selection

---

## Description

Two remaining attempt readers still choose the newest raw attempt before accounting for active-exam visibility. If the newest row belongs to an active exam session, older visible attempts for the same question can be ignored.

Observed behavior:
- Standalone question review (`getPreviousAttempt` with no `attemptId` or `sessionId`) loads the raw latest attempt via `findLatestByUserAndQuestion(...)`.
- If that raw latest attempt belongs to an active exam, `GetPreviousAttemptUseCase` returns `null` to avoid leaking correctness.
- Any older standalone, tutor, or ended-exam attempt remains hidden behind that active-exam row.
- Quick/ad-hoc question selection reads `findMostRecentAnsweredAtByQuestionIds(...)`, which computes `max(answered_at)` across raw attempts without the active-exam visibility predicate.

Expected behavior:
- Active-exam attempts should be invisible to implicit/latest readers until the exam ends.
- If an older visible attempt exists, implicit latest-attempt readers should return the latest visible row, not `null`.
- Exact active-exam identifiers (`attemptId` or active `sessionId`) should still return `null`; this bug is about implicit latest-reader fallback semantics.

## Impact

This does not reveal correctness, so it is lower severity than the original active-exam secrecy bugs.

- Standalone review surfaces can show `no_prior_attempt` even when the user has an older revealable attempt.
- Quick/ad-hoc question rotation can treat a hidden active-exam attempt as the latest attempt timestamp, affecting "unattempted first / oldest attempted next" selection.
- The behavior is inconsistent with BUG-235's now-fixed History query, where active-exam attempts are filtered before latest-visible ranking.
- BUG-237 prevents new active-exam attempt rows in the normal flow, but the reader layer still needs defense-in-depth for historical rows and future callers.

## Root Cause

Tracer-bullet path:

1. [`DrizzleAttemptRepository.findLatestByUserAndQuestion(...)`](../../src/adapters/repositories/drizzle-attempt-repository.ts#L275) selects from `attempts`, filters only by `userId` and `questionId`, orders by `answeredAt desc, id desc`, and returns one row.
2. [`GetPreviousAttemptUseCase`](../../src/application/use-cases/get-previous-attempt.ts#L94) uses that method for the implicit latest-attempt path.
3. [`GetPreviousAttemptUseCase`](../../src/application/use-cases/get-previous-attempt.ts#L153) then checks whether the selected attempt belongs to an active exam session and returns `null` if it does.
4. Because the visibility decision happens after the raw latest row is selected, an older visible attempt cannot be selected as fallback.
5. [`DrizzleAttemptRepository.findMostRecentAnsweredAtByQuestionIds(...)`](../../src/adapters/repositories/drizzle-attempt-repository.ts#L516) similarly computes `max(attempts.answeredAt)` without joining `practice_sessions` or applying `activeExamVisibilityCondition()`.
6. The correct filter-before-rank/filter-before-aggregate pattern now exists in [`DrizzleAttemptRepository.latestAttemptRowsSubquery(...)`](../../src/adapters/repositories/drizzle-attempt-repository.ts#L68) after BUG-235 and in [`DrizzleQuestionRepository.latestAttemptRowsSubquery(...)`](../../src/adapters/repositories/drizzle-question-repository.ts#L195).

## Expected Fix

Apply active-exam visibility before latest-row selection in the remaining implicit readers:

- Update `findLatestByUserAndQuestion(...)` to `leftJoin(practiceSessions, eq(attempts.practiceSessionId, practiceSessions.id))` and include `activeExamVisibilityCondition()` in the `where(...)` clause before ordering/limiting.
- Update `findMostRecentAnsweredAtByQuestionIds(...)` to join `practice_sessions` and apply `activeExamVisibilityCondition()` before `max(answeredAt)`.
- Keep `findByIdAndUserId(...)` and `findBySessionIdAndQuestionId(...)` exact-identifier semantics unchanged; `GetPreviousAttemptUseCase` should continue to return `null` when an exact requested attempt belongs to an active exam.
- Add integration coverage against real Postgres for older visible + newer active-exam fallback, no-fallback hidden behavior, and post-exam recovery.
- Keep scope tight. Do not modify the port unless naming clarity is required by the implementation.

## Verification

- [x] Code-level tracer-bullet verified on 2026-04-25.
- [x] Confirmed BUG-235 fixed attempted-question History by filtering active-exam rows before latest-attempt ranking.
- [x] Integration test: `findLatestByUserAndQuestion(...)` returns an older standalone/tutor/ended-exam attempt when a newer active-exam attempt is hidden.
- [x] Integration test: `findLatestByUserAndQuestion(...)` returns `null` when only an active-exam attempt exists, then returns that attempt after the exam ends.
- [x] Integration test: `findMostRecentAnsweredAtByQuestionIds(...)` ignores active-exam timestamps while preserving older visible timestamps.
- [x] Use-case/controller regression: standalone review hydration shows the older visible attempt instead of `no_prior_attempt` in the fallback case.
- [x] Full gate after fix: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.

## Related

- [BUG-235](../_archive/bugs/bug-235-attempted-question-history-drops-latest-visible-attempt.md)
- [BUG-237](../_archive/bugs/bug-237-submit-answer-allows-active-exam-session-writes.md)
- [Exam Answer Secrecy Policy](../practice-engine/exam-answer-secrecy-policy.md)
