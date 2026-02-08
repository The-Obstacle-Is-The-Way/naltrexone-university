# BUG-113: Orphaned Attempt Persisted When Submitting to Ended Session

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

`SubmitAnswerUseCase` inserts an `attempt` record unconditionally (line 98), then checks `session.endedAt === null` before calling `recordQuestionAnswer` (line 107). If the session has already ended, the attempt is persisted to the database but the session's `questionStates` is never updated. This creates a data inconsistency: the attempt exists in the `attempts` table but the session has no record of it.

**Observed:** An attempt row exists in the database for a question in an ended session, but the session's question states don't reflect it. Downstream queries that rely on session state (e.g., session summary, progress tracking) will not see this attempt.

**Expected:** Either (a) reject submission to ended sessions before inserting the attempt, or (b) always record the answer in the session state regardless of `endedAt`, or (c) explicitly document and test that orphaned attempts are the intended behavior.

## Steps to Reproduce

1. Start a practice session
2. End the session (or let it auto-end)
3. Submit an answer to a question in that ended session (race condition: user clicks "submit" just as the session ends)
4. Check the database: `attempts` table has the row, but the session's question states do not include it

## Root Cause

**File:** `src/application/use-cases/submit-answer.ts:98-142`

```typescript
// Line 98: Attempt is ALWAYS inserted, regardless of session state
const attempt = await this.attempts.insert({
  userId: input.userId,
  questionId: question.id,
  practiceSessionId: session ? session.id : null,
  selectedChoiceId: input.choiceId,
  isCorrect: grade.isCorrect,
  timeSpentSeconds,
});

// Line 107: But session state is only updated if session is still open
if (session && session.endedAt === null) {
  try {
    await this.sessions.recordQuestionAnswer({ ... });
  } catch (error) {
    // Rollback logic for the attempt if session update fails
    ...
  }
}
```

The insert-before-guard ordering means:
1. Session ends at time T
2. User submits answer at time T+1
3. Attempt is persisted (line 98)
4. `session.endedAt !== null`, so `recordQuestionAnswer` is skipped (line 107)
5. Attempt is orphaned — it exists but is invisible to session-based queries

The rollback logic (lines 118-141) only handles failures in `recordQuestionAnswer`, not the case where the guard skips it entirely.

## Impact

- **Data inconsistency** — attempt exists in `attempts` table but not in session state
- **Inaccurate session summaries** — session review/summary won't show the orphaned attempt
- **Inaccurate statistics** — if analytics queries use session state rather than raw attempts, they'll undercount
- **No test coverage** — there's no test for the ended-session code path, so the behavior is undocumented

## Resolution

Added an explicit ended-session guard in `SubmitAnswerUseCase` before attempt insertion:

```typescript
if (session && session.endedAt !== null) {
  throw new ApplicationError('CONFLICT', 'Practice session already ended');
}
```

This prevents orphan attempts by rejecting ended-session submissions before any write to `attempts`. The session-write branch now executes for all valid session submissions (guarded open sessions only).

## Verification

- [x] Submitting to an ended session throws `ApplicationError('CONFLICT')`
- [x] Attempt insertion is skipped for ended sessions (no orphan writes)
- [x] Unit test covers ended-session rejection and zero-attempt side effect
- [x] Full quality gates pass (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `src/application/use-cases/submit-answer.ts`
- `src/application/use-cases/submit-answer.test.ts`
- BUG-105 — concurrent answer submission race (resolved, added unique index)
- BUG-098 — question-not-in-session guard (resolved)
