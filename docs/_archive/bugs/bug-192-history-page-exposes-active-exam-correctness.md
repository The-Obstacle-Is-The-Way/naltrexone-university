# BUG-192: History Page Exposes Active Exam Attempt Correctness

**Status:** Fixed
**Priority:** P2
**Date:** 2026-03-03

---

## Description

The History page (`/app/history`) includes attempts from active exam sessions and renders their `isCorrect` status. A user can open the History page in a separate tab during an active exam and see which questions they got right or wrong.

Observed behavior:
- During an active exam, the History page shows exam attempts with `Correct`/`Incorrect` badges.
- Both the list view and count/filter surfaces include active exam data.

Expected behavior:
- Active exam attempts should either be excluded from History results or have `isCorrect` redacted until the exam ends.

## Steps to Reproduce

1. Start an exam session and answer several questions.
2. Open `/app/history` in a new tab (do not end the exam).
3. Observe the answered exam questions appear with correctness indicators.

## Root Cause

Tracer-bullet path:
1. History page calls `GetAttemptedQuestionsUseCase` at [get-attempted-questions.ts:65](../../../src/application/use-cases/get-attempted-questions.ts#L65).
2. Use case returns `isCorrect: attempted.isCorrect` unconditionally at [get-attempted-questions.ts:107](../../../src/application/use-cases/get-attempted-questions.ts#L107) and [get-attempted-questions.ts:119](../../../src/application/use-cases/get-attempted-questions.ts#L119).
3. Repository `listAttemptedQuestionsByUserId` at [drizzle-attempt-repository.ts:393-447](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L393) has no active-exam exclusion predicate.
4. Repository `countAttemptedQuestionsByUserId` at [drizzle-attempt-repository.ts:449-480](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L449) similarly lacks the predicate.
5. Contrast with `listRecentByUserId` at [drizzle-attempt-repository.ts:364-371](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L364) which correctly applies: `isNull(practiceSessions.id) OR ne(mode, 'exam') OR isNotNull(endedAt)`.

## Fix

Added `this.activeExamVisibilityCondition()` to the shared `buildAttemptedQuestionsConditions()` method in `drizzle-attempt-repository.ts`. This centralizes the predicate (`isNull(practiceSessions.id) OR ne(mode, 'exam') OR isNotNull(endedAt)`) so both `listAttemptedQuestionsByUserId` and `countAttemptedQuestionsByUserId` automatically exclude active exam attempts. The predicate is the same one already used by `listRecentByUserId`, preventing divergence.

Commit: `c1aea641 Fix BUG-192: Exclude active exam attempts from history page queries`

## Verification

- [x] Unit test added — `drizzle-attempt-repository.test.ts`: structural assertions verify the predicate references `mode` and `ended_at` columns for both list and count queries.
- [x] Integration test added — `repositories.integration.test.ts`: end-to-end test creates an active exam session, verifies attempts are excluded from list/count, ends the exam, and verifies they reappear.
- [ ] Manual verification

## Related

- Policy: [exam-answer-secrecy-policy.md](../../practice-engine/exam-answer-secrecy-policy.md)
- BUG-187 covers the same gap for dashboard aggregate counts.
- BUG-185 (fixed) established the `listRecentByUserId` predicate pattern.
