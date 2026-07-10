# BUG-293: Standalone `end()` Splits Its Pre-Reads Across Autocommit Statements — Concurrent Account Deletion Yields a False Corruption Error

**Status:** Open
**Severity:** P4
**Date:** 2026-07-09
**Confirmed:** 2026-07-10 (Cycle B4 adversarial re-audit against `9afd936c`; concurrent-discard leg refuted, account-deletion leg confirmed)
**Component:** Practice / end session

---

## Resolution State

Implemented on branch `fix/bug-292-293-practice-session-races`; the bug remains Open pending PR review, merge, and production proof.

## Summary

When [`DrizzlePracticeSessionRepository.end()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569-L611) is called on the raw repository used by standalone `EndPracticeSessionUseCase`, its two pre-reads run on autocommit `this.db`: [`findRowByIdAndUserId` at line 570](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L570) loads the session row, then [`toDomainFromRow` at line 579](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L579) issues a **second** SELECT for `practice_session_question_states` (via [`loadQuestionStateRowsBySessionIds`, line 199](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L199)). Each statement receives a fresh Read Committed snapshot. In contrast, [`findByIdAndUserId` (lines 262–268)](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L262-L268) wraps the same read pair in `inRepeatableRead`. A concurrent parent delete that commits between standalone `end()`'s reads therefore makes the second read see zero state rows for a session row already loaded as live. `tx.sessions.end()` inside exam finalization is not exposed: that repository is bound to the composition-root REPEATABLE READ transaction, so both reads inherit the outer fixed snapshot.

When that happens, [`toOrderedDomainQuestionStates` (lines 89–96)](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L89-L96) throws `CorruptPracticeSessionRowError` with code `INTERNAL_ERROR` and message `Practice session <id> is missing normalized question state` for a database that is consistent after the delete. [DEBT-427](../_archive/debt/debt-427-migration-fk-ordering-and-unaudited-cleanup.md) records the same message as a symptom of real migration cardinality drift, while [DEBT-439](../_archive/debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) deliberately keeps single-session corruption reads fail-loud. Neither archived doc designates this string as an automated operator alert; the defect is that this action result falsely reports the same durable-corruption category.

## Reachability

The reachable application path is an in-flight standalone end of a tutor session racing the Clerk `user.deleted` transaction for the same account. The webhook deletes the `users` row through [`deleteByClerkId`](../../src/adapters/repositories/drizzle-user-repository.ts#L137-L151); the `practice_sessions.user_id` cascade and then the `practice_session_question_states.practice_session_id` cascade remove both rows in that transaction. The schema edges are [`practice_sessions.user_id -> users.id`](../../db/schema.ts#L426-L428) and [`practice_session_question_states.practice_session_id -> practice_sessions.id`](../../db/schema.ts#L479-L481), both `ON DELETE CASCADE`.

The originally filed same-session end-vs-discard trigger is **refuted at current HEAD**. [`EndPracticeSessionUseCase` rejects active exam sessions](../../src/application/use-cases/end-practice-session.ts#L31-L35), while [`DiscardPracticeSessionUseCase` rejects tutor sessions](../../src/application/use-cases/discard-practice-session.ts#L29-L36). The public actions therefore cannot run both repository methods against the same valid session. Exam finalization does call `end()`, but does so on the transaction-bound repository described above rather than across two autocommit snapshots.

There is no cross-system guard for the remaining trigger: [`EndPracticeSessionUseCase` calls `sessions.end()` directly (line 38)](../../src/application/use-cases/end-practice-session.ts#L38), and the end action's idempotency claim does not serialize it against a Clerk webhook transaction.

## Reproduction

Race interleaving (narrow window between two statements):

1. An already-authorized end request for a tutor session enters `end()`. The repository reads the session row via autocommit at [line 570](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L570); `endedAt` is null, so the [line 575 conflict check](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L575) passes.
2. Before the state-row SELECT at [line 579](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L579), a concurrent Clerk `user.deleted` transaction deletes the user row and commits its cascades through the session and state rows ([clerk-webhook-controller.ts#L325-L338](../../src/adapters/controllers/clerk-webhook-controller.ts#L325-L338)).
3. Line 579's autocommit SELECT now sees the post-delete state: 0 state rows for a session whose `params.questionIds.length >= 1`.
4. [`toOrderedDomainQuestionStates` line 89](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L89): `rows.length < params.questionIds.length` → throws `CorruptPracticeSessionRowError` (`INTERNAL_ERROR`, "Practice session … is missing normalized question state").

Expected: `NOT_FOUND` — which is what a delete committing after domain mapping but before the guarded UPDATE produces through the `!updated` fallback at [lines 593–603](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L593-L603) (fresh re-check, session gone).

Actual: `EndPracticeSessionUseCase` propagates the `ApplicationError`; [`createAction`](../../src/adapters/controllers/create-action.ts#L53-L68) converts it to a non-throwing `ActionResult` with code `INTERNAL_ERROR` and the specific missing-state message. This is not a raw HTTP 500. The incomplete-session and session-page clients surface action-result messages as error state; `handleError` does not log recognized `ApplicationError`s, so the original claim that operators automatically receive a corruption alert was also overstated. The next database read sees the session as absent, although account deletion may leave the user unable to retry interactively.

## Root Cause

The standalone read pair in `end()` is not a snapshot. `findByIdAndUserId` uses [`inRepeatableRead` (lines 157–163)](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L157-L163) so the session row and state rows come from one snapshot; standalone `end()` runs the same pair on raw `this.db`, so each statement gets a new Read Committed snapshot. A committed parent-row cascade between statements produces read skew: statement 1 sees a live session, statement 2 sees its children gone. The row-count invariant check then mistakes this cross-statement inconsistency for durable row corruption. The method itself is context-sensitive: when constructed with a transaction-bound Drizzle handle for finalize, the installed postgres-js driver nests via a savepoint and the reads inherit the outer RR snapshot.

Historical context: [DEBT-439](../_archive/debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) reordered `end()`'s domain mapping to before the UPDATE commit (which is why line 579 precedes the UPDATE at line 581) but did not transactionalize the read pair.

## Impact

- One spurious `INTERNAL_ERROR` action result with a misleading durable-corruption message during an end request that races account deletion. The database remains consistent and a subsequent repository read returns absence.
- The message is also used for genuine state-cardinality corruption, so a user report or captured client diagnostic could send investigation down the wrong path. There is no automatic server-side operator alert for this recognized `ApplicationError` today.

**Severity rationale (P4):** the window is narrow between two adjacent statements, requires a Clerk account-deletion cascade concurrent with an already-authorized tutor-session end, causes no data loss or wrong persisted state, and disappears on the next read. It is filed because the failure is miscategorized (`INTERNAL_ERROR` with a durable-corruption message instead of `NOT_FOUND`), not because the public end/discard pair can race — it cannot.

## Proposed Fix

1. **Recommended — wrap standalone `end()`'s two pre-reads (lines 570–579) in `this.inRepeatableRead`,** mirroring `findByIdAndUserId`, and return the loaded row/domain value from that read transaction. PostgreSQL's [Repeatable Read documentation](https://www.postgresql.org/docs/current/transaction-iso.html) states that read-only transactions do not incur serialization conflicts; a concurrent cascade is therefore seen either before both reads or after both. Keep the later guarded UPDATE and its fresh `!updated` NOT_FOUND/CONFLICT fallback unchanged. On a transaction-bound finalize repository, Drizzle's nested call is a savepoint that inherits the already-Repeatable-Read outer transaction, so this does not create a conflicting isolation owner. Pin the user-delete interleaving with a real-Postgres regression rather than only a sequential mock.
2. Alternative: catch `CorruptPracticeSessionRowError` around line 579, re-check session existence with a fresh `findRowByIdAndUserId`, and map to `NOT_FOUND` if the row is gone (preserving `INTERNAL_ERROR` for true corruption). More code for the same outcome.
3. Alternative: fold the whole of standalone `end()` — reads plus UPDATE — into one REPEATABLE READ transaction. That requires a fresh-transaction retry owner for `40001`/`40P01` (see the [BUG-268](../_archive/bugs/bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) precedent), so it is a higher-cost fix for the same user-visible misclassification.

## Related

- [DEBT-201](../_archive/debt/debt-201-practice-session-end-returns-stale-data.md) (archived) — `end()` stale return value; a different defect in the same method.
- [DEBT-437](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) (archived, ACCEPT ruling) — covers the tutor-submit-vs-end *write-skew* (`answered_at > ended_at` persistence), not this read-skew phantom error; this bug is not reducible to it.
- [DEBT-439](../_archive/debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) (archived) — preserved fail-loud single-session corruption handling and reordered `end()`'s mapping, but left the standalone read pair untransactionalized.
- [DEBT-441](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md), [BUG-267](../_archive/bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md), [BUG-268](../_archive/bugs/bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) (all archived) — concern the question-state updater and nested-RR mechanics, not `end()`'s pre-reads.

Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
