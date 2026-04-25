# BUG-235: Attempted-Question History Drops Prior Visible Attempt During Active Exam

**Status:** Open
**Priority:** P3
**Date:** 2026-04-24
**Resolution State:** Fixed on branch `fix-bug-235-history-latest-visible-fallback`; pending PR review, merge verification, and archival.

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

- [x] **Regression — older standalone + newer active-exam:** Added integration coverage proving `listAttemptedQuestionsByUserId(...)` falls back to the older standalone row's `answeredAt` and `isCorrect` while the newer active-exam row is hidden. Evidence: `tests/integration/bug-regression.integration.test.ts` → `BUG-235: Attempted-question history keeps latest visible fallback` → `falls back to an older standalone attempt when a newer active-exam attempt is hidden`. Red failed with `[]`; green passed after `latestAttemptRowsSubquery(...)` filtered before ranking.
- [x] **Regression — older tutor + newer active-exam:** Added integration coverage proving the latest visible tutor-mode row remains selected while a newer active-exam row is hidden. Evidence: `tests/integration/bug-regression.integration.test.ts` → `falls back to an older tutor attempt when a newer active-exam attempt is hidden`. Red failed with `[]`; green passed after the subquery shape matched `DrizzleQuestionRepository`.
- [x] **Regression — older ended-exam + newer active-exam:** Added integration coverage proving the latest visible ended-exam row remains selected while a newer active-exam row is hidden. Evidence: `tests/integration/bug-regression.integration.test.ts` → `falls back to an older ended-exam attempt when a newer active-exam attempt is hidden`. Red failed with `[]`; green passed after the subquery applied `activeExamVisibilityCondition()` before `row_number()`.
- [x] **Count parity:** Each BUG-235 regression scenario asserts `countAttemptedQuestionsByUserId(...)` equals the returned list length, so list/count semantics stay paired across standalone, tutor, and ended-exam fallback cases.
- [x] **BUG-192 sibling case preserved (no fallback exists):** Added integration coverage for a question with only an active-exam attempt: list returns `[]` and count returns `0` while the exam is active, then the question appears after exam end. Evidence: `tests/integration/bug-regression.integration.test.ts` → `continues to hide an active-exam attempt when no visible fallback exists`.
- [x] **Post-exam-end recovery:** The standalone fallback scenario ends the active exam and re-queries History, proving the formerly hidden active-exam attempt becomes the latest visible row with its newer `answeredAt` and `isCorrect`. The no-fallback sibling test also verifies post-exam recovery from zero visible rows to one visible row.
- [x] **Filter interactions don't regress:** Existing attempted-question filter integration coverage remains unchanged and is included in the full integration gate: `tests/integration/session-attempt-repository.integration.test.ts` covers result, source, difficulty, tagSlug, combined filters, and deterministic latest-attempt tie-breaks; `tests/integration/bug-regression.integration.test.ts` keeps the BUG-192 active-exam exclusion case green.
- [x] **Existing unit tests pass with mock-shape update:** `src/adapters/repositories/drizzle-attempt-repository.test.ts` now models the `latestAttemptRowsSubquery(...)` chain as `.from().leftJoin().where().as()` and asserts the new latest-row left join is used for both list and count paths. Evidence: `pnpm test --run src/adapters/repositories/drizzle-attempt-repository.test.ts` passed with 29 tests.
- [x] Run the full pre-push gate: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` (per `.claude/rules/git-workflow.md` — pre-push hook is insufficient). Evidence: full pre-push gate passed locally on 2026-04-25 after the code and documentation updates.

## Related

- Policy: [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
- Upstream write-path bug: [BUG-237](./bug-237-submit-answer-allows-active-exam-session-writes.md)
- Prior fix: [BUG-192](../_archive/bugs/bug-192-history-page-exposes-active-exam-correctness.md)
- Related implementation pattern: [drizzle-question-repository.ts](../../src/adapters/repositories/drizzle-question-repository.ts)
