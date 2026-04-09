# BUG-185: Dashboard Recent Activity Reveals Active Exam Correctness

**Status:** Resolved
**Priority:** P1
**Date:** 2026-03-02
**Resolved:** 2026-03-02 (PR #162, commit `f04e0a9`)

---

## Description

Dashboard recent activity renders per-attempt correctness (`Correct` / `Incorrect`) for attempts that can belong to an exam session that is still active (`endedAt === null`).

Observed behavior:
- During an active exam session, visiting `/app/dashboard` can reveal correctness for already-answered exam questions.
- The same row also includes an `attemptId` review deep link, widening the leak surface.

Expected behavior:
- Active exam sessions must not reveal correctness before exam review/summary.

---

## Steps to Reproduce

1. Start an exam session and answer at least one question.
2. Before ending the session, open `/app/dashboard`.
3. In "Recent activity", observe a `Correct` or `Incorrect` badge for that attempt.
4. Observe the row links to review mode with `attemptId`.

Executable verification performed on 2026-03-02:
1. Repro harness returned `GetUserStatsUseCase.recentActivity` row with `{ sessionMode: 'exam', isCorrect: true }`.
2. Dashboard render path uses `row.isCorrect` directly for result label and includes `attemptId` in the review URL.

---

## Root Cause

Tracer-bullet path:
1. Dashboard loads stats via [dashboard/page.tsx](../../../app/(app)/app/dashboard/page.tsx#L260) calling `getUserStats`.
2. Stats use case fetches recent attempts at [get-user-stats.ts](../../../src/application/use-cases/get-user-stats.ts#L94).
3. Repository query for recent attempts filters only by user at [drizzle-attempt-repository.ts](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L361), with no `endedAt` exclusion for active exam sessions (join occurs at [drizzle-attempt-repository.ts](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L357)).
4. Use case maps `isCorrect` straight into output at [get-user-stats.ts](../../../src/application/use-cases/get-user-stats.ts#L126).
5. Dashboard renders `Correct` / `Incorrect` from that field at [dashboard/page.tsx](../../../app/(app)/app/dashboard/page.tsx#L202) and [dashboard/page.tsx](../../../app/(app)/app/dashboard/page.tsx#L243), and deep-links with `attemptId` at [dashboard/page.tsx](../../../app/(app)/app/dashboard/page.tsx#L230).

---

## Fix (TDD)

Fixed.

### Red — failing test added first

Added regression test in [drizzle-attempt-repository.test.ts](../../../src/adapters/repositories/drizzle-attempt-repository.test.ts#L588):

```typescript
it('excludes attempts from active exam sessions in listRecentByUserId', async () => {
  // Arrange: user has three attempts
  //   1) active exam session attempt (endedAt null)
  //   2) ended exam session attempt
  //   3) ad-hoc attempt
  // Act: listRecentByUserId(userId, 20)
  // Assert: result does NOT include the active-exam attempt,
  //         includes ended exam + ad-hoc attempts
});
```

The test now verifies the query includes the secrecy filter columns and passes with the repository fix.

### Green — minimum code change

Added active-exam exclusion predicate in [drizzle-attempt-repository.ts](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L364):

```typescript
.where(
  and(
    eq(attempts.userId, userId),
    or(
      isNull(practiceSessions.id),
      ne(practiceSessions.mode, 'exam'),
      isNotNull(practiceSessions.endedAt),
    ),
  ),
)
```

This preserves recent activity for ad-hoc, tutor, and ended exam attempts while suppressing active exam correctness leaks.

### Refactor

No helper extracted; predicate kept in place for clarity.

---

## Verification

- [x] Repository regression test added and passing.
- [x] Manual verification: active exam attempts are excluded from dashboard recent activity projection.
- [x] Gate run: `pnpm typecheck && pnpm lint && pnpm test --run`.
