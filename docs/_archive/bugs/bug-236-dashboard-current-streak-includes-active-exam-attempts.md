# BUG-236: Dashboard Current Streak Includes Active-Exam Attempts

**Status:** Resolved (PR #285, merged 2026-04-25)
**Priority:** P3
**Date:** 2026-04-24
**Resolution State:** Fixed in PR #285, merged to dev `dded5033` and main on 2026-04-25.

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

Update `DrizzleAttemptRepository.listAnsweredAtByUserIdSince(...)` at `src/adapters/repositories/drizzle-attempt-repository.ts:401-412` to mirror the established sister-method pattern in this same file:

- **Switch from the relational query API to the explicit query builder.** The sister methods `countWhere(...)` (lines 323-343) and `listRecentByUserId(...)` (lines 368-399) both use `this.db.select(...).from(attempts).leftJoin(practiceSessions, ...).where(and(eq(attempts.userId, userId), this.activeExamVisibilityCondition(), <other-conditions>))`. Use the same shape — do NOT use `db.query.attempts.findMany(...)` with a nested `with:` clause; the relational API does not cleanly support filtering on joined-table columns and would diverge from sibling code.
- **Use `leftJoin(practiceSessions, eq(attempts.practiceSessionId, practiceSessions.id))`.** A left join is required so standalone-quick-practice attempts (where `attempts.practiceSessionId IS NULL`) survive — `activeExamVisibilityCondition()` (`drizzle-attempt-repository.ts:53-66`) already returns true for the `practiceSessions.id IS NULL` branch produced by the unmatched leftJoin.
- **Apply `this.activeExamVisibilityCondition()`** alongside the existing `eq(attempts.userId, userId)` and `gte(attempts.answeredAt, since)` predicates inside a single `and(...)` block.
- **Preserve the public contract:** select only `attempts.answeredAt` (no extra columns from `practiceSessions`), keep `orderBy(desc(attempts.answeredAt))`, return `readonly Date[]` exactly as the port `AttemptStatsReader.listAnsweredAtByUserIdSince` declares.

This is a **defense-in-depth alignment** with the secrecy/visibility policy. After BUG-237's fix, the upstream `submitAnswer` write boundary no longer creates active-exam `attempts` rows in the normal flow. This bug fix nonetheless stands because (a) the projection layer must independently enforce the policy as the regression contract demands, (b) any historical active-exam attempt rows created before BUG-237's fix must be filtered, and (c) the inconsistency between sibling methods is itself a maintenance hazard.

Do NOT modify any other repository methods. Do NOT modify the `AttemptStatsReader` port. Do NOT modify `GetUserStatsUseCase` — its `computeStreak(attemptsLast60Days, now)` call is correct as written and consumes whatever `Date[]` the repository returns. Do NOT modify the `FakeAttemptRepository` for this bug; the fake's broader fidelity gap (it does not currently model `activeExamVisibilityCondition()` for any method) is out of scope and would expand the diff unnecessarily — the integration test against real Postgres is the authoritative coverage for this fix.

## Verification

- [x] Add a `DrizzleAttemptRepository` integration test (`tests/integration/`, real Postgres test DB) for `listAnsweredAtByUserIdSince(...)` covering all four visibility cases: (1) active-exam-mode session attempt is **excluded**, (2) ended-exam-mode session attempt is **included**, (3) tutor-mode session attempt (any state) is **included**, (4) standalone attempt (`practiceSessionId IS NULL`) is **included**. Evidence: `tests/integration/bug-regression.integration.test.ts` → `BUG-236: Dashboard streak timestamps exclude active-exam attempts` → `filters active exam attempts while preserving ended exam, tutor, and standalone timestamps`. Red failed because the active-exam timestamp was returned; green passed after `listAnsweredAtByUserIdSince(...)` applied `activeExamVisibilityCondition()`.
- [x] Add an integration test proving the returned ordering remains `answeredAt DESC` with at least three timestamps, including ones across the visibility boundary. Evidence: `tests/integration/bug-regression.integration.test.ts` → `BUG-236: Dashboard streak timestamps exclude active-exam attempts` → `keeps answeredAt descending order after filtering hidden active-exam rows`. Red failed because the hidden active-exam row appeared first; green passed with only visible timestamps ordered newest to oldest.
- [x] Verify the existing `GetUserStatsUseCase` unit tests still pass unchanged (the fake is not being modified, so existing fake-driven streak tests must continue to pass). Evidence: `pnpm test --run` in the full gate includes the unchanged `src/application/use-cases/get-user-stats.test.ts` suite.
- [x] Verify the existing dashboard accuracy / count / recent-activity integration tests still pass — none of them touch this method, but the regression suite must stay green. Evidence: `pnpm test:integration` in the full gate includes the existing BUG-187 dashboard count and recent-activity integration coverage plus the new BUG-236 regression tests.
- [x] Run the full pre-push gate: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` (per `.claude/rules/git-workflow.md` — pre-push hook is insufficient). Evidence: full pre-push gate passed locally on 2026-04-25 after the code and documentation updates.

## Related

- Policy: [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
- Upstream write-path bug: [BUG-237](./bug-237-submit-answer-allows-active-exam-session-writes.md)
- Prior fix: [BUG-187](../_archive/bugs/bug-187-dashboard-accuracy-includes-active-exam-attempts.md)
- Related dashboard surface: [dashboard/page.tsx](../../app/(app)/app/dashboard/page.tsx)
