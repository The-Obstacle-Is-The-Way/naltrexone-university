# BUG-268: CAS retry loop in `updatePracticeSessionQuestionState` doesn't catch Postgres serialization failures once the write transaction runs REPEATABLE READ

**Status:** Open
**Priority:** P1
**Date:** 2026-07-01

---

## Description

`updatePracticeSessionQuestionState` (`src/adapters/repositories/practice-session-question-state-updater.ts:146-199`) retries up to `UPDATE_QUESTION_STATE_MAX_RETRIES = 3` times whenever its CAS `UPDATE ... WHERE id = ... AND version = ...` (lines 169-189) matches **zero rows** — that "silently no-op, then retry" behavior is a READ COMMITTED guarantee: under READ COMMITTED, a concurrently-committed change to the target row causes the UPDATE to re-evaluate its WHERE clause against the latest committed data, simply finding no match if the version is now stale.

Under REPEATABLE READ — which the (currently uncommitted, in-progress) BUG-267 fix now applies to the *outer* write transaction in `lib/container/use-cases.ts` (`PRACTICE_SESSION_STATE_WRITE_TRANSACTION_CONFIG = { isolationLevel: 'repeatable read' }`, wired into both `FinalizeExamAnswersUseCase`'s and `SubmitAnswerUseCase`'s `writeTransaction`) — this behavior changes. The nested `input.db.transaction(...)` call at line 151 is a SAVEPOINT inside that outer REPEATABLE READ transaction, so it inherits the same fixed snapshot for its whole lifetime. When our CAS `UPDATE` targets a row that a **different, already-committed transaction** has concurrently modified since the snapshot was taken, Postgres does not silently return zero rows — it raises `ERROR 40001: could not serialize access due to concurrent update` for the UPDATE statement itself. This is standard Postgres MVCC behavior for REPEATABLE READ (and stricter), not something specific to this driver.

The retry `for` loop (`practice-session-question-state-updater.ts:146-199`) never wraps the `await input.db.transaction(...)` call (line 151) in a try/catch. A `40001` from the CAS UPDATE therefore propagates straight out of `updatePracticeSessionQuestionState`, out of the enclosing `writeTransaction` callback, and aborts the whole `FinalizeExamAnswersUseCase.execute` / session-backed `SubmitAnswerUseCase.execute` call as a raw, uncaught `postgres` driver error — not the intended `ApplicationError('CONFLICT' | 'INTERNAL_ERROR', ...)` the retry-exhaustion path (lines 201-210) was designed to produce.

There is a second-order effect worth naming explicitly: because REPEATABLE READ fixes one snapshot for the *entire* outer transaction, a retry attempt within the same call can never observe a newer row version even if it wanted to — `existing.row.version` read at line 153 is identical on attempt 1, 2, and 3 of the same `updatePracticeSessionQuestionState` call. So for a genuinely concurrent conflict, the retry loop's three attempts are not three independent chances to succeed against fresher data; the very first attempt either succeeds (no real conflict) or throws `40001` (real conflict) — attempts 2 and 3 are dead code for this class of failure.

## Impact

Two independent, plausible concurrent-write scenarios per session:
- A user has the exam open in two tabs (or a stale tab left open after starting a new one), and one tab's autosave (`saveDraftAnswer`) races the other tab's `finalize-exam-answers` call for the same question.
- `SetPracticeSessionQuestionMarkUseCase` (mark-for-review, un-nested, top-level READ COMMITTED — see `lib/container/use-cases.ts:96-98`) writes the same row a `FinalizeExamAnswersUseCase` call (nested, REPEATABLE READ) is concurrently writing.

In both cases, the finalize/submit call surfaces a raw `PostgresError` (`40001`) to the caller instead of a handled `ApplicationError`. Depending on how the Server Action/route boundary handles unexpected exceptions, this is either an unstyled 500 or a generic error toast — worse UX than the clean `CONFLICT`/`INTERNAL_ERROR` this code path was explicitly designed to produce, and it defeats the retry mechanism's entire purpose for the one class of failure it exists to handle.

## Resolution

Wrap the per-attempt `await input.db.transaction(...)` call (line 151) in a try/catch that recognizes Postgres serialization-failure error codes (`40001`, and `40P01` deadlock, if relevant) and treats them the same as a `status: 'stale'` result — i.e., falls through to the next loop iteration (or, given the "same snapshot across retries" finding above, arguably should re-derive `existing.row.version` from a **fresh** read outside the fixed snapshot, which likely means each retry attempt needs its own top-level transaction rather than a savepoint inside one long-lived REPEATABLE READ transaction — a design question to resolve alongside DEBT-426, since both touch the same lock/transaction-shape surface).

## Verification

An integration test that starts a REPEATABLE READ write transaction wrapping two concurrent CAS attempts on the same `practice_session_question_states` row (one committing before the other's UPDATE executes) should observe the losing writer get a handled `ApplicationError`, not an uncaught `postgres` `40001` exception.

## Related

- PR #537, [BUG-267 (archived, in-progress fix pending commit)](../_archive/bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md)
- [DEBT-426](../debt/debt-426-session-wide-lock-defeats-row-concurrency.md) — same lock/transaction-shape surface, sequence any redesign together
- `src/adapters/repositories/practice-session-question-state-updater.ts:146-211`
- `lib/container/use-cases.ts` (`PRACTICE_SESSION_STATE_WRITE_TRANSACTION_CONFIG`)
- Found via a systematic post-fix transaction/locking audit (2026-07-01), independently re-verified by reading the actual code (not the audit agent's summary alone)
