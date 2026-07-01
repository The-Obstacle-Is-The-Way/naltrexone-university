# BUG-268: CAS retry loop in `updatePracticeSessionQuestionState` doesn't catch Postgres serialization failures once the write transaction runs REPEATABLE READ

**Status:** Resolved
**Priority:** P1
**Date:** 2026-07-01
**Resolved:** 2026-07-01
**Scope:** Branch-local pre-merge defect in PR #537; fixed and verified before the Track A implementation shipped.

---

## Description

`updatePracticeSessionQuestionState` (`src/adapters/repositories/practice-session-question-state-updater.ts:146-199`) retries up to `UPDATE_QUESTION_STATE_MAX_RETRIES = 3` times whenever its CAS `UPDATE ... WHERE id = ... AND version = ...` (lines 169-189) matches **zero rows** — that "silently no-op, then retry" behavior is a READ COMMITTED guarantee: under READ COMMITTED, a concurrently-committed change to the target row causes the UPDATE to re-evaluate its WHERE clause against the latest committed data, simply finding no match if the version is now stale.

Under REPEATABLE READ — which the BUG-267 fix now applies to the *outer* write transaction in `lib/container/use-cases.ts` (`PRACTICE_SESSION_STATE_WRITE_TRANSACTION_CONFIG = { isolationLevel: 'repeatable read' }`, wired into both `FinalizeExamAnswersUseCase`'s and `SubmitAnswerUseCase`'s `writeTransaction` in commit `3512c4c6`) — this behavior changes. The nested `input.db.transaction(...)` call at line 151 is a SAVEPOINT inside that outer REPEATABLE READ transaction, so it inherits the same fixed snapshot for its whole lifetime. When our CAS `UPDATE` targets a row that a **different, already-committed transaction** has concurrently modified since the snapshot was taken, Postgres does not silently return zero rows — it raises `ERROR 40001: could not serialize access due to concurrent update` for the UPDATE statement itself. This is standard Postgres MVCC behavior for REPEATABLE READ (and stricter), not something specific to this driver.

The retry `for` loop (`practice-session-question-state-updater.ts:146-199`) never wraps the `await input.db.transaction(...)` call (line 151) in a try/catch. A `40001` from the CAS UPDATE therefore propagates straight out of `updatePracticeSessionQuestionState`, out of the enclosing `writeTransaction` callback, and aborts the whole `FinalizeExamAnswersUseCase.execute` / session-backed `SubmitAnswerUseCase.execute` call as a raw, uncaught `postgres` driver error — not the intended `ApplicationError('CONFLICT' | 'INTERNAL_ERROR', ...)` the retry-exhaustion path (lines 201-210) was designed to produce.

There is a second-order effect worth naming explicitly: because REPEATABLE READ fixes one snapshot for the *entire* outer transaction, a retry attempt within the same call can never observe a newer row version even if it wanted to — `existing.row.version` read at line 153 is identical on attempt 1, 2, and 3 of the same `updatePracticeSessionQuestionState` call. So for a genuinely concurrent conflict inside a nested REPEATABLE READ caller, the retry loop's three attempts are not three independent chances to succeed against fresher data; the very first attempt either succeeds (no real conflict) or throws `40001` (real conflict). The local retry loop still has value for top-level READ COMMITTED repository calls, but it is the wrong retry boundary for nested REPEATABLE READ writers.

## Impact

Two independent, plausible concurrent-write scenarios per session:
- A user has the exam open in two tabs (or a stale tab left open after starting a new one), and one tab's autosave (`saveDraftAnswer`) races the other tab's `finalize-exam-answers` call for the same question.
- A draft autosave for a different question lands after `FinalizeExamAnswersUseCase` has read its session snapshot but before finalize reaches that row. This was initially filed as BUG-269, but under the current repeatable-read boundary it does **not** silently clobber the answer; it reaches this same raw-`40001` failure mode.
- `SetPracticeSessionQuestionMarkUseCase` (mark-for-review, un-nested, top-level READ COMMITTED — see `lib/container/use-cases.ts:182-185`) writes the same row a `FinalizeExamAnswersUseCase` call (nested, REPEATABLE READ) is concurrently writing.

In both cases, the finalize/submit call surfaces a raw `PostgresError` (`40001`) to the caller instead of a handled `ApplicationError`. Depending on how the Server Action/route boundary handles unexpected exceptions, this is either an unstyled 500 or a generic error toast — worse UX than the clean `CONFLICT`/`INTERNAL_ERROR` this code path was explicitly designed to produce, and it defeats the retry mechanism's entire purpose for the one class of failure it exists to handle.

## Resolution

Fixed on `chore/legacy-audit` as a branch-local pre-merge blocker in PR #537. `lib/container/use-cases.ts` now owns a bounded composition-root helper for the two practice-session-state write transactions (`FinalizeExamAnswersUseCase` and session-backed `SubmitAnswerUseCase`):

- The helper opens the outer transaction at `{ isolationLevel: 'repeatable read' }`, preserving the BUG-267 fix.
- It catches retryable Postgres transaction failures (`40001` serialization failure and `40P01` deadlock), then reruns the entire write-transaction callback in a fresh top-level transaction/snapshot, up to 3 attempts.
- If all retry attempts fail, it maps the last retryable database error to `ApplicationError('CONFLICT', 'Practice session state changed concurrently; please retry.')` with the original error preserved as `cause`, so raw driver errors no longer escape the use case.
- It deliberately does **not** change `updatePracticeSessionQuestionState`'s local zero-row CAS retry loop. That loop remains correct for top-level READ COMMITTED calls such as mark-for-review; nested REPEATABLE READ conflicts are handled at the owning transaction boundary.

Side-effect audit before choosing auto-retry: both affected callbacks perform only database reads/writes inside the transaction. Attempt inserts, question-state writes, and session-end writes roll back with the aborted transaction; no email, Stripe, logging, or other non-idempotent external side effect runs inside the retried callback.

## Verification

- [x] `lib/container.test.ts` covers both affected write-transaction wirings: finalize retries after a synthetic `40001`, session-backed submit retries after a synthetic `40P01`, and exhausted retryable failures map to `ApplicationError('CONFLICT')` with the original cause.
- [x] `tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts` uses two real Postgres connections. The first session-backed submit transaction takes a REPEATABLE READ snapshot, a second connection commits a concurrent `practice_session_question_states` update, the first attempt hits the real `40001` path, and the composition-root helper retries the full callback so the submit resolves and preserves the concurrent `markedForReview` state.
- [x] Focused runs: `pnpm test --run lib/container.test.ts`; `pnpm test --run scripts/seed-helpers.test.ts scripts/seed.test.ts lib/container.test.ts`; `DATABASE_URL=<local-test-db> pnpm test:integration -- tests/integration/bug-regression-seed-choice-sync.integration.test.ts tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts`.

## Related

- PR #537, [BUG-267 (archived)](./bug-267-nested-repeatable-read-silently-drops-isolation.md)
- [BUG-269 (invalidated)](./bug-269-finalize-exam-stale-snapshot-clobbers-concurrent-draft-save.md) — its stale finalize window is a trigger for this bug, not an independent silent-clobber defect under current HEAD
- [DEBT-426](../../debt/debt-426-session-wide-lock-defeats-row-concurrency.md) — same lock/transaction-shape surface, sequence any future lock redesign with this retry boundary
- `src/adapters/repositories/practice-session-question-state-updater.ts:146-211`
- `lib/container/use-cases.ts` (`PRACTICE_SESSION_STATE_WRITE_TRANSACTION_CONFIG`)
- Found via a systematic post-fix transaction/locking audit (2026-07-01), independently re-verified by reading the actual code (not the audit agent's summary alone)
