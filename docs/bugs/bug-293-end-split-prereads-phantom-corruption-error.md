# BUG-293: end() Pre-Reads Session and State Rows in Separate Autocommit Statements — a Concurrent Discard Yields a Phantom Corruption INTERNAL_ERROR

**Status:** Active
**Severity:** P4
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Practice / end session

---

## Summary

[`DrizzlePracticeSessionRepository.end()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569) performs its two pre-reads on the raw autocommit `this.db`: [`findRowByIdAndUserId` at line 570](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L570) loads the session row, then [`toDomainFromRow` at line 579](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L579) issues a **second** SELECT for the `practice_session_question_states` rows (via [`loadQuestionStateRowsBySessionIds`, line 199](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L199)). Because these are two separate autocommit statements — unlike [`findByIdAndUserId` (lines 262–268)](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L262), which wraps the identical read pair in `inRepeatableRead` for snapshot consistency — a concurrent delete that commits between them makes the second read see zero state rows for a session row already loaded as live.

When that happens, [`toOrderedDomainQuestionStates` (lines 89–96)](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L89) throws `CorruptPracticeSessionRowError` with code `INTERNAL_ERROR` and the message `Practice session <id> is missing normalized question state` — the exact corruption-investigation signature established by [DEBT-427](../_archive/debt/debt-427-migration-fk-ordering-and-unaudited-cleanup.md) / [DEBT-439](../_archive/debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) — for a database that is perfectly consistent.

## Reachability

Any signed-in user with an in-progress session open in two contexts (two tabs, two devices) where one context ends the session while the other discards it; or a Clerk `user.deleted` webhook processing concurrently with an `end()` call. The concurrent writers are:

- [`discard()` (lines 539–567)](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539), which deletes the state rows and the session row in one committed transaction; and
- the `users.id` CASCADE chain in [`db/schema.ts` line 428](../../db/schema.ts#L428) (`practice_sessions.user_id → users.id, onDelete: 'cascade'`) plus [line 481](../../db/schema.ts#L481) (`practice_session_question_states.practice_session_id → practice_sessions.id, onDelete: 'cascade'`).

There is no higher-level guard: [`EndPracticeSessionUseCase` calls `sessions.end()` directly (line 38)](../../src/application/use-cases/end-practice-session.ts#L38), and idempotency claims are per-operation, so they do not serialize `end` against `discard`.

## Reproduction

Race interleaving (millisecond window between two statements):

1. Tab A calls `end()`. The repo reads the session row via autocommit at [line 570](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L570); `endedAt` is null, so the [line 575 CONFLICT check](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L575) passes.
2. Before the state-row SELECT at [line 579](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L579) executes, Tab B's `discard()` transaction ([lines 539–567](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539)) commits, deleting both the `practice_session_question_states` rows and the `practice_sessions` row (or the `users` CASCADE does the same during account deletion).
3. Line 579's autocommit SELECT now sees the post-delete state: 0 state rows for a session whose `params.questionIds.length >= 1`.
4. [`toOrderedDomainQuestionStates` line 89](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L89): `rows.length < params.questionIds.length` → throws `CorruptPracticeSessionRowError` (`INTERNAL_ERROR`, "Practice session … is missing normalized question state").

Expected: `NOT_FOUND` — which is exactly what the same race produces one statement later, via the `!updated` fallback at [lines 593–603](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L593) (re-check, session gone → `NOT_FOUND`).

Actual: `EndPracticeSessionUseCase` propagates the `INTERNAL_ERROR`; the user gets a 500, and operators see the register's canonical corruption signature for a database with no corruption. Self-healing on retry.

## Root Cause

The read pair in `end()` is not a snapshot. `findByIdAndUserId` was deliberately built around [`inRepeatableRead` (lines 157–163)](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L157) so that the session row and its state rows come from one consistent snapshot; `end()` runs the identical pair on `this.db` in autocommit mode, so each statement gets its own snapshot. A committed concurrent delete between the two statements produces read skew: statement 1 sees a live session, statement 2 sees its children already gone. The row-count invariant check in `toOrderedDomainQuestionStates` then misreads a transient cross-statement inconsistency as durable row corruption.

Historical context: [DEBT-439](../_archive/debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) reordered `end()`'s domain mapping to before the UPDATE commit (which is why line 579 precedes the UPDATE at line 581) but did not transactionalize the read pair.

## Impact

- One spurious 500 to the user in a race they themselves (or account deletion) triggered; a retry lands on the correct `NOT_FOUND`/`CONFLICT` path.
- Operator cost is the larger half: the error message is the exact string DEBT-427/DEBT-439 designated as the trigger for corrupt-row investigation, so each occurrence risks a false-alarm data-integrity investigation.

**Severity rationale (P4):** the window is milliseconds wide between two adjacent statements, requires a concurrent discard/user-deletion against the same session, causes no data loss or wrong persisted state, and self-heals on retry. It is filed at all because the failure mode is a *miscategorized* error (500 + corruption signature instead of `NOT_FOUND`), not merely a transient failure.

## Proposed Fix

1. **RECOMMENDED — wrap `end()`'s two pre-reads (lines 570–579) in `this.inRepeatableRead`,** mirroring `findByIdAndUserId`. A read-only REPEATABLE READ snapshot cannot hit serialization failures, so no retry logic is needed, and the autocommit UPDATE keeps its existing `!updated` NOT_FOUND/CONFLICT fallback untouched.
2. Alternative: catch `CorruptPracticeSessionRowError` around line 579, re-check session existence with a fresh `findRowByIdAndUserId`, and map to `NOT_FOUND` if the row is gone (preserving `INTERNAL_ERROR` for true corruption). More code for the same outcome.
3. Alternative: fold the whole of `end()` — reads plus UPDATE — into one REPEATABLE READ transaction. Strongest consistency, but a read-write RR transaction requires serialization-failure retry handling (see the [BUG-268](../_archive/bugs/bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) precedent), so it is a higher cost for the same user-visible fix.

## Related

- [DEBT-201](../_archive/debt/debt-201-practice-session-end-returns-stale-data.md) (archived) — `end()` stale return value; a different defect in the same method.
- [DEBT-437](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) (archived, ACCEPT ruling) — covers the tutor-submit-vs-end *write-skew* (`answered_at > ended_at` persistence), not this read-skew phantom error; this bug is not reducible to it.
- [DEBT-439](../_archive/debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) (archived) — established the corrupt-row error taxonomy and reordered `end()`'s mapping, but left the read pair untransactionalized.
- [DEBT-441](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md), [BUG-267](../_archive/bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md), [BUG-268](../_archive/bugs/bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) (all archived) — concern the question-state updater and nested-RR mechanics, not `end()`'s pre-reads.

Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
