# BUG-192: History Page Exposes Active Exam Attempt Correctness

**Status:** Open
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
1. History page calls `GetAttemptedQuestionsUseCase` at [get-attempted-questions.ts:65](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-attempted-questions.ts:65).
2. Use case returns `isCorrect: attempted.isCorrect` unconditionally at [get-attempted-questions.ts:107](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-attempted-questions.ts:107) and [get-attempted-questions.ts:119](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-attempted-questions.ts:119).
3. Repository `listAttemptedQuestionsByUserId` at [drizzle-attempt-repository.ts:393-447](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:393) has no active-exam exclusion predicate.
4. Repository `countAttemptedQuestionsByUserId` at [drizzle-attempt-repository.ts:449-480](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:449) similarly lacks the predicate.
5. Contrast with `listRecentByUserId` at [drizzle-attempt-repository.ts:364-371](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:364) which correctly applies: `isNull(practiceSessions.id) OR ne(mode, 'exam') OR isNotNull(endedAt)`.

## Fix

Not yet implemented.

Expected fix shape:
- Apply the same active-exam exclusion predicate used by `listRecentByUserId` to the attempted-questions query methods.
- Centralize the predicate to avoid divergence (shared helper or composable SQL fragment).

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification

## Related

- Policy: [exam-answer-secrecy-policy.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/practice-engine/exam-answer-secrecy-policy.md)
- BUG-187 covers the same gap for dashboard aggregate counts.
- BUG-185 (fixed) established the `listRecentByUserId` predicate pattern.
