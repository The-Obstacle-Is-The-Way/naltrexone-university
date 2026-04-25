# BUG-235: Attempted-Question History Drops Prior Visible Attempt During Active Exam

**Status:** Open
**Priority:** P3
**Date:** 2026-04-24

---

## Description

The History page's attempted-question list can temporarily hide a previously visible question while the user has a newer attempt for that same question in an active exam session.

Observed behavior:
- A question with an older standalone, tutor, or ended-session attempt appears in History.
- If a newer active-exam attempt exists for the same question, the attempted-question list and count drop the question entirely.
- The question reappears after the exam session ends.

Expected behavior:
- Active-exam attempts should be excluded from History until exam end.
- Older visible attempts for the same question should remain visible as the latest visible attempt.

## Steps to Reproduce

1. Create or use a published question.
2. Submit a visible attempt for that question outside an active exam, or in an already-ended session.
3. Start an exam session that includes the same question.
4. Create an active-exam attempt row for that same question before ending the exam.
5. Open `/app/history?tab=questions`, or call the attempted-question History use case.
6. Observe the question is missing from the list/count until the exam session is ended.

## Root Cause

Tracer-bullet path:
1. `DrizzleAttemptRepository.latestAttemptRowsSubquery(...)` ranks all user attempts in [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L68) through [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L83).
2. `buildAttemptedQuestionsConditions(...)` then requires `attemptRank = 1` and only applies the active-exam visibility predicate afterward in [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L92) through [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L95).
3. `listAttemptedQuestionsByUserId(...)` and `countAttemptedQuestionsByUserId(...)` both consume that already-ranked subquery in [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L414) through [drizzle-attempt-repository.ts](../../src/adapters/repositories/drizzle-attempt-repository.ts#L500).
4. When an active-exam attempt is the newest row, it receives rank 1. The outer visibility filter removes it, but the older visible attempt is rank 2 and cannot be selected.
5. The safer pattern already exists in `DrizzleQuestionRepository.latestAttemptRowsSubquery(...)`: it joins `practice_sessions` and applies `activeExamVisibilityCondition()` inside the subquery before ranking in [drizzle-question-repository.ts](../../src/adapters/repositories/drizzle-question-repository.ts#L195) through [drizzle-question-repository.ts](../../src/adapters/repositories/drizzle-question-repository.ts#L214).

This is a follow-up gap to BUG-192. BUG-192 correctly stopped active-exam attempts from appearing in History, but its coverage did not include the fallback case where an older visible attempt should still be returned. BUG-237 tracks the upstream server-action boundary that can still create active-exam attempt rows before exam finalization.

## Impact

This does not reveal active-exam correctness, so it is lower severity than BUG-192. It is still user-visible and policy-relevant because History count/list surfaces can move backward during an active exam and then recover after submission. It also creates inconsistent "latest visible attempt" semantics between the History attempted-question path and the Question Repository's progress-status path.

## Expected Fix

Move the `practice_sessions` join and `activeExamVisibilityCondition()` **inside** `DrizzleAttemptRepository.latestAttemptRowsSubquery(...)` at `src/adapters/repositories/drizzle-attempt-repository.ts:68-83`, mirroring the established pattern in `DrizzleQuestionRepository.latestAttemptRowsSubquery(...)` at `src/adapters/repositories/drizzle-question-repository.ts:195-214`.

**Implementation choice — pinned.** Do NOT extract a shared latest-visible-attempt helper across repositories. Two private subqueries with overlapping shape but different SELECT lists is honest duplication, not a candidate for premature abstraction (per `CLAUDE.md`). The Question repository already has the correct shape; copy it into the Attempt repository and stop.

**Concrete shape (adapt to existing imports):**

```typescript
private latestAttemptRowsSubquery(userId: string) {
  return this.db
    .select({
      questionId: attempts.questionId,
      answeredAt: attempts.answeredAt,
      practiceSessionId: attempts.practiceSessionId,
      isCorrect: attempts.isCorrect,
      attemptRank: latestAttemptRankSql({
        questionId: attempts.questionId,
        answeredAt: attempts.answeredAt,
        id: attempts.id,
      }).as('attempt_rank'),
    })
    .from(attempts)
    .leftJoin(
      practiceSessions,
      eq(attempts.practiceSessionId, practiceSessions.id),
    )
    .where(
      and(eq(attempts.userId, userId), this.activeExamVisibilityCondition()),
    )
    .as('latest_attempt_rows');
}
```

**Then remove the now-redundant outer predicate** at `drizzle-attempt-repository.ts:94`: delete `this.activeExamVisibilityCondition()` from `buildAttemptedQuestionsConditions(...)`. After the subquery filters active-exam rows BEFORE ranking, the outer condition is dead duplication. Keep `eq(latestAttemptRows.attemptRank, 1)` and the rest of the conditions exactly as they are. The outer `leftJoin(practiceSessions, ...)` in `listAttemptedQuestionsByUserId` (lines 447-450) and `countAttemptedQuestionsByUserId` (lines 496-499) **must stay** — those joins are still needed to surface `practiceSessions.mode` for the `sessionMode` SELECT column (line 444) and the `source: 'tutor' | 'exam'` filter at `buildAttemptedQuestionsConditions(...)` line 111.

This is a **defense-in-depth alignment** with the secrecy/visibility policy. After BUG-237's fix, the upstream `submitAnswer` write boundary no longer creates active-exam `attempts` rows in the normal flow. This bug fix nonetheless stands because (a) the projection layer must independently enforce the policy as the regression contract demands, (b) any historical active-exam attempt rows created before BUG-237's fix must yield correct latest-visible fallback semantics, and (c) the inconsistency between the Attempt repository's subquery shape and the Question repository's subquery shape is itself a maintenance hazard.

Do NOT modify `DrizzleQuestionRepository` — its `latestAttemptRowsSubquery` is already correct and is the reference exemplar. Do NOT modify the `AttemptRepository` port. Do NOT modify any consumer use case (`GetAttemptedQuestionsUseCase`, etc.). The list and count queries must keep identical filtering semantics — they already share the subquery and the conditions builder, so symmetry is preserved by construction.

The unit-test mock infrastructure for `latestAttemptRowsSubquery` in `src/adapters/repositories/drizzle-attempt-repository.test.ts` will need to be updated to reflect the new chain shape (`.from().leftJoin().where().as()` instead of `.from().where().as()`). Mirror the BUG-236 PR #285 approach for adding `leftJoin` mock steps without touching unrelated test scaffolding.

## Verification

- [ ] **Regression — older standalone + newer active-exam:** Add an integration test that creates a standalone visible attempt for question Q, then a newer active-exam attempt for the same Q, and asserts `listAttemptedQuestionsByUserId` returns the question with the **older** standalone attempt's `answeredAt` and `isCorrect`. The active-exam timestamp must NOT appear.
- [ ] **Regression — older tutor + newer active-exam:** Same scenario with a tutor-mode session for the older attempt. Same assertion shape.
- [ ] **Regression — older ended-exam + newer active-exam:** Same scenario with an ended-exam-mode session for the older attempt. Same assertion shape.
- [ ] **Count parity:** In each of the three regression scenarios above, assert `countAttemptedQuestionsByUserId` returns the same count as the list length. List/count must never disagree.
- [ ] **BUG-192 sibling case preserved (no fallback exists):** Add an integration test that creates ONLY an active-exam attempt for question Q (no prior visible attempt), and asserts the question is **excluded** from list and count while the exam is active. This proves the original BUG-192 behavior is preserved when there is genuinely nothing to fall back to.
- [ ] **Post-exam-end recovery:** After ending the active exam in any of the regression scenarios, the active-exam attempt becomes the latest visible attempt — the question's `answeredAt` and `isCorrect` in the list now reflect the post-exam attempt, not the older visible one.
- [ ] **Filter interactions don't regress:** Spot-check that `result: 'correct' | 'incorrect'`, `source: 'adhoc' | 'tutor' | 'exam'`, `difficulty`, and `tagSlug` filters still produce the same results for non-active-exam fixtures as before the fix. The existing BUG-192 integration test in `tests/integration/bug-regression.integration.test.ts` must continue to pass unchanged.
- [ ] **Existing unit tests pass with mock-shape update:** `src/adapters/repositories/drizzle-attempt-repository.test.ts` `listAttemptedQuestionsByUserId` and `countAttemptedQuestionsByUserId` describe-blocks must continue to pass. Update the mock chain shape (insert a `leftJoin` step before `where`) without changing test intent.
- [ ] Run the full pre-push gate: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` (per `.claude/rules/git-workflow.md` — pre-push hook is insufficient).

## Related

- Policy: [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
- Upstream write-path bug: [BUG-237](./bug-237-submit-answer-allows-active-exam-session-writes.md)
- Prior fix: [BUG-192](../_archive/bugs/bug-192-history-page-exposes-active-exam-correctness.md)
- Related implementation pattern: [drizzle-question-repository.ts](../../src/adapters/repositories/drizzle-question-repository.ts)
