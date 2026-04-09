# BUG-195: Question Candidate Status Filter Leaks Active Exam Correctness via Inference

**Status:** Fixed
**Priority:** P3
**Date:** 2026-03-03

---

## Description

The `latestAttemptRowsSubquery` used by `buildStatusCondition('incorrect', ...)` in `DrizzleQuestionRepository` includes attempts from active exam sessions. A user can infer exam answer correctness by observing count changes from `countPublishedCandidateIds({ statuses: ['incorrect'] })` before and after answering an exam question.

Observed behavior:
- During an active exam, opening a second tab and calling `countAvailableQuestions({ statuses: ['incorrect'] })` reflects exam answer correctness in the count.

Expected behavior:
- Active exam attempts should be excluded from the latest-attempt subquery used by status filters, matching the secrecy policy.

## Steps to Reproduce

1. Note the count of "incorrect" questions via the practice session config UI.
2. Start an exam session and answer a question.
3. In a second tab, re-check the "incorrect" count.
4. If the count increased by 1, the exam answer was wrong. If unchanged, it was right.

## Root Cause

Tracer-bullet path:
1. `latestAttemptRowsSubquery` at [drizzle-question-repository.ts:176-190](../../../src/adapters/repositories/drizzle-question-repository.ts#L176) selects from `attempts` with only a `userId` filter — no join on `practiceSessions`, no active-exam exclusion.
2. `buildStatusCondition('incorrect', ...)` at [drizzle-question-repository.ts:209-222](../../../src/adapters/repositories/drizzle-question-repository.ts#L209) uses the vulnerable subquery to filter for `isCorrect = false`.
3. Reachable from `countPublishedCandidateIds` (line 158) via `CountAvailableQuestionsUseCase`, from `listPublishedCandidateIds` (line 136) via `StartPracticeSessionUseCase` and `GetNextQuestionUseCase.executeForFilters`.

Contrast with `listRecentByUserId` in `drizzle-attempt-repository.ts:364` which correctly applies the 3-way active-exam exclusion predicate.

## Fix

Implemented in `DrizzleQuestionRepository`:
- `latestAttemptRowsSubquery` now `leftJoin`s `practiceSessions` and applies the active-exam
  exclusion predicate: `isNull(practiceSessions.id) OR ne(mode, 'exam') OR isNotNull(endedAt)`.
  This ensures status-filtered `incorrect` candidate counts exclude active exam attempts.
- The `unanswered` status subquery in `buildStatusCondition` also received the same
  `leftJoin` + predicate treatment. Without this, a user could infer exam participation by
  observing "unanswered" count drops during an active exam.

## Verification

- [x] Unit test added — `drizzle-question-repository.test.ts` asserts both `unanswered` and `incorrect` status subqueries include `practiceSessions.mode`/`ended_at` secrecy predicates.
- [x] Integration test added — `repositories.integration.test.ts` proves active-exam attempts stay invisible to `unanswered`/`incorrect` status filters until the exam ends.
- [ ] Manual verification
- [x] Code-level tracer-bullet verified (Audit #12, 2026-03-03)

## Related

- Policy: [exam-answer-secrecy-policy.md](../../practice-engine/exam-answer-secrecy-policy.md)
- BUG-187 and BUG-192 cover the same predicate gap in other repository methods.
- This is an inference-based leak (count delta reveals correctness), not a direct exposure.
