# BUG-236: Dashboard Current Streak Includes Active-Exam Attempts

**Status:** Open
**Priority:** P3
**Date:** 2026-04-24

---

## Description

The dashboard excludes active-exam attempts from aggregate answer counts, accuracy, and recent activity, but the `Current streak` card still uses unfiltered answer timestamps.

Observed behavior:
- During an active exam, an answer attempt can contribute to `currentStreakDays`.
- Other dashboard stats correctly exclude that same active-exam attempt until exam end.
- The dashboard can therefore show a nonzero or extended streak while `Total answered`, `Answered (7 days)`, and `Recent activity` still hide the in-progress exam work.

Expected behavior:
- Dashboard streak calculations should use the same active-exam visibility policy as dashboard counts and recent activity.

## Steps to Reproduce

1. Use a user with no visible answered attempt for today.
2. Start an exam session and create an active-exam attempt row for today.
3. Open `/app/dashboard` before ending the exam.
4. Observe `Current streak` can include the active-exam attempt even while the other dashboard attempt surfaces exclude it.
5. End the exam and verify the attempt can then contribute to the streak.

## Root Cause

Tracer-bullet path:
1. `GetUserStatsUseCase` computes `currentStreakDays` from `attemptsLast60Days` in [get-user-stats.ts](../../src/application/use-cases/get-user-stats.ts#L81) through [get-user-stats.ts](../../src/application/use-cases/get-user-stats.ts#L102).
2. `attemptsLast60Days` comes from `AttemptStatsReader.listAnsweredAtByUserIdSince(...)` in [get-user-stats.ts](../../src/application/use-cases/get-user-stats.ts#L93).
3. `DrizzleAttemptRepository.listAnsweredAtByUserIdSince(...)` queries `attempts` directly with only user/date predicates in [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L401) through [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L412).
4. That method does not join `practice_sessions` and does not apply `activeExamVisibilityCondition()`.
5. The adjacent dashboard count and recent-activity paths already apply the visibility predicate in [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L323) through [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L398).
6. The dashboard renders `stats.currentStreakDays` directly in [dashboard/page.tsx](../../app/(app)/app/dashboard/page.tsx#L93) through [dashboard/page.tsx](../../app/(app)/app/dashboard/page.tsx#L101).

This is a follow-up gap to BUG-187. BUG-187 fixed dashboard aggregate counts and recent activity, but the streak timestamp reader remained outside the shared active-exam visibility predicate. BUG-237 tracks the upstream server-action boundary that can still create active-exam attempt rows before exam finalization.

## Impact

This does not expose correctness, but it violates the dashboard's active-exam visibility model and can produce contradictory stats during an active exam. A student can see streak progress from in-progress exam work before the exam is submitted, while the rest of the dashboard correctly withholds that session's attempt data.

## Expected Fix

Update `DrizzleAttemptRepository.listAnsweredAtByUserIdSince(...)` to use the same active-exam visibility predicate as the other `AttemptStatsReader` methods:
- Join `practice_sessions` on `attempts.practiceSessionId`.
- Apply `activeExamVisibilityCondition()` with the existing user/date predicates.
- Keep ordering deterministic with the current descending timestamp order.

Add regression coverage that proves current streak ignores active-exam attempts until the exam session ends.

## Verification

- [ ] Add repository integration coverage for `listAnsweredAtByUserIdSince(...)` excluding active-exam attempts.
- [ ] Add a use-case regression test for `GetUserStatsUseCase` proving `currentStreakDays` ignores active-exam timestamps until exam end.
- [ ] Verify the existing dashboard count, accuracy, and recent-activity tests still pass.

## Related

- Policy: [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
- Upstream write-path bug: [BUG-237](./bug-237-submit-answer-allows-active-exam-session-writes.md)
- Prior fix: [BUG-187](../_archive/bugs/bug-187-dashboard-accuracy-includes-active-exam-attempts.md)
- Related dashboard surface: [dashboard/page.tsx](../../app/(app)/app/dashboard/page.tsx)
