# BUG-105: Concurrent Answer Submission Can Create Duplicate Attempts

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-07

---

## Description

If two concurrent `submitAnswer` requests arrive for the same practice session and question, both can insert an attempt before either updates the session state. The optimistic locking in `updateQuestionState` (CAS on `paramsJson`) ensures only one session-state update wins, but the loser's attempt is already persisted. The rollback logic (lines 112-136 of `submit-answer.ts`) deletes the loser's attempt, but there is a window where:

1. Both requests read the same session state
2. Both insert their attempt (both succeed — no unique constraint on `(sessionId, questionId)`)
3. Both call `recordQuestionAnswer`
4. One wins the CAS, the other retries up to 3 times and eventually fails
5. The loser's attempt is rolled back — but only if the rollback succeeds

**Observed:** Under concurrent requests, duplicate attempts can exist briefly. If the rollback fails (e.g., network error), the duplicate persists permanently.

**Expected:** Only one answer per question per session should be persisted, even under concurrent submission.

## Steps to Reproduce

1. Start a practice session with at least one question
2. Send two concurrent `submitAnswer` requests for the same question with different choices
3. Observe both attempts inserted before CAS resolves
4. If rollback fails, observe duplicate attempt records

## Root Cause

`SubmitAnswerUseCase.execute()` inserts the attempt (line 93) before recording session state (line 104). The session-state update uses optimistic locking, but attempt insertion has no uniqueness guard. The two-phase operation (insert attempt → update session state → rollback attempt on failure) is not atomic.

## Impact

- Statistics can be corrupted (double-counted answers)
- Session state and attempt table can diverge
- Low probability in practice (requires sub-second concurrent submissions for same question), but possible under network retries or double-clicks

## Fix

1. Added migration hardening in `db/migrations/0008_attempts_session_question_unique.sql`:
   - Deletes historical duplicates per `(practice_session_id, question_id)`, keeping the latest (`answered_at DESC, id DESC`)
   - Creates partial unique index `attempts_session_question_uq` for non-null `practice_session_id`
2. Mapped Postgres unique-violation errors in `DrizzleAttemptRepository.insert()` to `ApplicationError('CONFLICT', 'This question has already been answered in this session')`
3. Kept fake parity by enforcing the same session-question uniqueness in `FakeAttemptRepository.insert()`

## Verification

- [x] Unit tests cover duplicate-submission conflict behavior at use-case and repository boundaries
- [x] Migration enforces one-row invariant and removes historical duplicates before unique-index creation

## Related

- `src/application/use-cases/submit-answer.ts`
- `src/adapters/repositories/drizzle-attempt-repository.ts`
- `db/migrations/0008_attempts_session_question_unique.sql`
