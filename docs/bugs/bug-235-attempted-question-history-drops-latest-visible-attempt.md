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

Apply the active-exam visibility predicate before latest-attempt ranking for attempted-question History queries. The implementation should either:
- Move the `practice_sessions` join and `activeExamVisibilityCondition()` into `DrizzleAttemptRepository.latestAttemptRowsSubquery(...)`, matching `DrizzleQuestionRepository`, or
- Extract a shared latest-visible-attempt subquery helper used by both repositories.

The list and count queries must keep identical filtering semantics.

## Verification

- [ ] Add an integration regression test that creates an older visible attempt and a newer active-exam attempt for the same question, then verifies History still returns the older visible attempt.
- [ ] Verify the attempted-question count remains stable in that same scenario.
- [ ] Verify the active-exam attempt becomes the latest visible attempt only after the exam session ends.

## Related

- Policy: [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
- Upstream write-path bug: [BUG-237](./bug-237-submit-answer-allows-active-exam-session-writes.md)
- Prior fix: [BUG-192](../_archive/bugs/bug-192-history-page-exposes-active-exam-correctness.md)
- Related implementation pattern: [drizzle-question-repository.ts](../../src/adapters/repositories/drizzle-question-repository.ts)
