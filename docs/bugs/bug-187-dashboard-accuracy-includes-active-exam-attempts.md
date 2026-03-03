# BUG-187: Dashboard Accuracy Includes Active Exam Attempts

**Status:** Open
**Priority:** P1
**Date:** 2026-03-03

---

## Description

Dashboard aggregate metrics (`Total answered`, `Overall accuracy`, `Answered (7 days)`, `Accuracy (7 days)`) currently include attempts from active exam sessions.

Observed behavior:
- During an active exam, each new answer can change dashboard aggregate accuracy values before the exam is ended.

Expected behavior:
- Active exam attempts should be excluded from user-facing correctness metrics until exam end, matching exam-answer secrecy policy.

## Steps to Reproduce

1. Start an exam session and answer one or more questions.
2. Before ending the session, open `/app/dashboard`.
3. Observe aggregate stats changing based on those in-progress exam answers.

## Root Cause

Tracer-bullet path:
1. Stats use case computes aggregate counts from `count*` methods in [get-user-stats.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-user-stats.ts:89) through [get-user-stats.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-user-stats.ts:93).
2. Repository count methods are implemented by `countWhere` over `attempts` only (no `practice_sessions` join/exclusion) in [drizzle-attempt-repository.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:300) through [drizzle-attempt-repository.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:337).
3. `listRecentByUserId` already excludes active exam attempts in [drizzle-attempt-repository.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:364), but aggregate count queries do not.
4. Dashboard renders those aggregate values directly in [dashboard/page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/dashboard/page.tsx:66) through [dashboard/page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/dashboard/page.tsx:87).

## Fix

Not yet implemented.

Expected fix shape:
- Scope aggregate count methods to the same secrecy predicate used by recent activity:
  `isNull(practiceSessions.id) OR practiceSessions.mode != 'exam' OR practiceSessions.endedAt IS NOT NULL`.
- Centralize the predicate to avoid divergence across repository methods.

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [x] Manual verification

## Related

- Policy: [exam-answer-secrecy-policy.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/practice-engine/exam-answer-secrecy-policy.md)
- Related prior fix: BUG-185 (recent-activity projection)
