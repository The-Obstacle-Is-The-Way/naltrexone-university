# BUG-293: Standalone `end()` Splits Its Pre-Reads Across Autocommit Statements — Concurrent Account Deletion Yields a False Corruption Error

**Status:** Resolved
**Severity:** P4
**Date:** 2026-07-09
**Confirmed:** 2026-07-10 (Cycle B4 adversarial re-audit against `9afd936c`; concurrent-discard leg refuted, account-deletion leg confirmed)
**Component:** Practice / end session

---

## Resolution (2026-07-11)

Fixed in PR #627 (squash `0c1221af` to dev), promoted via PR #629 (main `cca0470d`); production deploy succeeded and `https://addictionboards.com/` returned HTTP/2 200. Standalone `end()`'s two pre-reads now run in one `inRepeatableRead` snapshot mirroring `findByIdAndUserId`; the guarded UPDATE and its `!updated` NOT_FOUND/CONFLICT fallback are unchanged. A user-deletion cascade committing between the logical pre-reads now maps to NOT_FOUND instead of the corruption signature, while genuinely missing state stays fail-loud — both pinned in `tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts`.


## Implementation Notes (fix branch)

Implemented in [PR #627](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/627) on branch `fix/bug-292-293-practice-session-races`; merged and production-verified 2026-07-11 — see the Resolution section above.

## Summary

At the audited pre-fix head, standalone [`DrizzlePracticeSessionRepository.end()`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569-L616) loaded the session row and normalized `practice_session_question_states` through two autocommit `this.db` statements. Each statement received a fresh Read Committed snapshot, unlike `findByIdAndUserId`, which already wrapped the same read pair in `inRepeatableRead`. A concurrent parent delete committing between those pre-reads could therefore make the state SELECT see zero rows for a session row already loaded as live.

PR #627 fixes that split: current [`end()` lines 570–584](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L570-L584) load the row and domain value inside one `inRepeatableRead` callback. Standalone calls now use one fixed snapshot; transaction-bound exam finalization nests through a savepoint and inherits its outer REPEATABLE READ snapshot.

Under the pre-fix interleaving, [`toOrderedDomainQuestionStates` (lines 89–96)](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L89-L96) threw `CorruptPracticeSessionRowError` with code `INTERNAL_ERROR` and message `Practice session <id> is missing normalized question state` for a database that was consistent after the delete. [DEBT-427](../debt/debt-427-migration-fk-ordering-and-unaudited-cleanup.md) records the same message as a symptom of real migration cardinality drift, while [DEBT-439](../debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) deliberately keeps single-session corruption reads fail-loud. Neither archived doc designates this string as an automated operator alert; the defect was that this action result falsely reported the same durable-corruption category.

## Reachability

The pre-fix reachable application path was an in-flight standalone end of a tutor session racing the Clerk `user.deleted` transaction for the same account. The webhook deletes the `users` row through [`deleteByClerkId`](../../../src/adapters/repositories/drizzle-user-repository.ts#L137-L151); the `practice_sessions.user_id` cascade and then the `practice_session_question_states.practice_session_id` cascade remove both rows in that transaction. The schema edges are [`practice_sessions.user_id -> users.id`](../../../db/schema.ts#L426-L428) and [`practice_session_question_states.practice_session_id -> practice_sessions.id`](../../../db/schema.ts#L479-L481), both `ON DELETE CASCADE`.

The originally filed same-session end-vs-discard trigger is **refuted at current HEAD**. [`EndPracticeSessionUseCase` rejects active exam sessions](../../../src/application/use-cases/end-practice-session.ts#L31-L35), while [`DiscardPracticeSessionUseCase` rejects tutor sessions](../../../src/application/use-cases/discard-practice-session.ts#L29-L36). The public actions therefore cannot run both repository methods against the same valid session. Exam finalization does call `end()`, but does so on the transaction-bound repository described above rather than across two autocommit snapshots.

There is no cross-system guard for the remaining trigger: [`EndPracticeSessionUseCase` calls `sessions.end()` directly (line 38)](../../../src/application/use-cases/end-practice-session.ts#L38), and the end action's idempotency claim does not serialize it against a Clerk webhook transaction.

## Reproduction

Pre-fix race interleaving (narrow window between two statements):

1. An already-authorized end request for a tutor session entered `end()`. The first autocommit statement loaded a live session row with `endedAt = null`.
2. Before the separate state-row SELECT, a concurrent Clerk `user.deleted` transaction deleted the user row and committed its cascades through the session and state rows ([clerk-webhook-controller.ts#L325-L338](../../../src/adapters/controllers/clerk-webhook-controller.ts#L325-L338)).
3. The second autocommit SELECT saw the post-delete state: 0 state rows for a session whose `params.questionIds.length >= 1`.
4. [`toOrderedDomainQuestionStates` line 89](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L89): `rows.length < params.questionIds.length` → throws `CorruptPracticeSessionRowError` (`INTERNAL_ERROR`, "Practice session … is missing normalized question state").

Expected: `NOT_FOUND` — which is what the implemented fixed-snapshot read followed by a zero-row guarded UPDATE produces through the fresh [`!updated` fallback](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L598-L608) when the session is gone.

Pre-fix actual: `EndPracticeSessionUseCase` propagated the `ApplicationError`; [`createAction`](../../../src/adapters/controllers/create-action.ts#L53-L68) converted it to a non-throwing `ActionResult` with code `INTERNAL_ERROR` and the specific missing-state message. This was not a raw HTTP 500. The incomplete-session and session-page clients surfaced action-result messages as error state; `handleError` did not log recognized `ApplicationError`s, so the original claim that operators automatically received a corruption alert was also overstated. The next database read saw the session as absent, although account deletion could leave the user unable to retry interactively.

## Root Cause

The pre-fix standalone read pair in `end()` was not a snapshot. `findByIdAndUserId` already used [`inRepeatableRead` (lines 157–163)](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L157-L163), but `end()` ran the same pair on raw `this.db`, giving each statement a new Read Committed snapshot. A committed parent-row cascade between statements produced read skew: statement 1 saw a live session, statement 2 saw its children gone, and the row-count invariant check mistook that cross-statement inconsistency for durable corruption.

The implemented [`end()` pre-read transaction](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L570-L584) now gives standalone calls one snapshot. When the repository is bound to the outer finalize transaction, the installed postgres-js driver nests the same helper via a savepoint, so the reads inherit the outer REPEATABLE READ snapshot without creating another isolation or retry owner.

Historical context: [DEBT-439](../debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) reordered `end()`'s domain mapping to before the UPDATE commit but did not transactionalize the pre-read pair at the audited pre-fix head.

## Impact

- One spurious `INTERNAL_ERROR` action result with a misleading durable-corruption message during an end request that races account deletion. The database remains consistent and a subsequent repository read returns absence.
- The message is also used for genuine state-cardinality corruption, so a user report or captured client diagnostic could send investigation down the wrong path. There is no automatic server-side operator alert for this recognized `ApplicationError` today.

**Severity rationale (P4):** the window is narrow between two adjacent statements, requires a Clerk account-deletion cascade concurrent with an already-authorized tutor-session end, causes no data loss or wrong persisted state, and disappears on the next read. It is filed because the failure is miscategorized (`INTERNAL_ERROR` with a durable-corruption message instead of `NOT_FOUND`), not because the public end/discard pair can race — it cannot.

## Proposed Fix

1. **Recommended — implemented in PR #627:** wrap standalone `end()`'s two pre-reads in `this.inRepeatableRead`, mirroring `findByIdAndUserId`, and return the loaded domain value from that read transaction. PostgreSQL's [Repeatable Read documentation](https://www.postgresql.org/docs/current/transaction-iso.html) states that read-only transactions do not incur serialization conflicts; a concurrent cascade is therefore seen either before both reads or after both. Keep the later guarded UPDATE and its fresh `!updated` NOT_FOUND/CONFLICT fallback unchanged. On a transaction-bound finalize repository, Drizzle's nested call is a savepoint that inherits the already-Repeatable-Read outer transaction, so this does not create a conflicting isolation owner. Pin the user-delete interleaving with a real-Postgres regression rather than only a sequential mock.
2. Alternative: catch `CorruptPracticeSessionRowError` around domain mapping, re-check session existence with a fresh `findRowByIdAndUserId`, and map to `NOT_FOUND` if the row is gone (preserving `INTERNAL_ERROR` for true corruption). More code for the same outcome.
3. Alternative: fold the whole of standalone `end()` — reads plus UPDATE — into one REPEATABLE READ transaction. That requires a fresh-transaction retry owner for `40001`/`40P01` (see the [BUG-268](./bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) precedent), so it is a higher-cost fix for the same user-visible misclassification.

## Related

- [DEBT-201](../debt/debt-201-practice-session-end-returns-stale-data.md) (archived) — `end()` stale return value; a different defect in the same method.
- [DEBT-437](../debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) (archived, ACCEPT ruling) — covers the tutor-submit-vs-end *write-skew* (`answered_at > ended_at` persistence), not this read-skew phantom error; this bug is not reducible to it.
- [DEBT-439](../debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) (archived) — preserved fail-loud single-session corruption handling and reordered `end()`'s mapping, but left the standalone read pair untransactionalized.
- [DEBT-441](../debt/debt-441-updater-dead-stale-retry-paths-under-rr.md), [BUG-267](./bug-267-nested-repeatable-read-silently-drops-isolation.md), [BUG-268](./bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) (all archived) — concern the question-state updater and nested-RR mechanics, not `end()`'s pre-reads.

Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
