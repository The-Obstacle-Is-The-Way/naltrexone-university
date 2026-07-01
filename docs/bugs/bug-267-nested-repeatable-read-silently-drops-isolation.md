# BUG-267: Nested `inRepeatableRead` silently drops isolation level, reintroducing a torn-read race in exam finalization

**Status:** Open
**Priority:** P2
**Date:** 2026-06-30

---

## Description

`DrizzlePracticeSessionRepository.inRepeatableRead()` (`src/adapters/repositories/drizzle-practice-session-repository.ts:154-160`) calls `this.db.transaction(callback, { isolationLevel: 'repeatable read' })`. When `this.db` is already an open transaction — exactly how `FinalizeExamAnswersUseCase`'s write transaction wires `tx.sessions` (`lib/container/use-cases.ts:41-55`) — this becomes a *nested* transaction (a Postgres SAVEPOINT).

Verified directly in `node_modules/.../drizzle-orm/postgres-js/session.js`: the top-level `PostgresJsSession.transaction(transaction, config)` applies `config.isolationLevel` via `tx.setTransaction(config)`, but the nested `PostgresJsTransaction.transaction(transaction)` takes only one argument — it never receives or applies a config object at all. The requested `repeatable read` upgrade silently no-ops, and the nested block runs at the outer transaction's default (READ COMMITTED) isolation level.

## Steps to Reproduce

This is a race condition, not deterministic, but the window is real:

1. User A has an in-progress exam session.
2. `FinalizeExamAnswersUseCase.execute()` begins its write transaction and calls `tx.sessions.findByIdAndUserId(...)` (`src/application/use-cases/finalize-exam-answers.ts:119`) as its first statement inside the transaction — this is the nested, isolation-dropped path.
3. Concurrently, something deletes the `practice_sessions` row (cascading to `practice_session_question_states` via `ON DELETE CASCADE`) and commits in the window between the internal session-row SELECT and the question-state-rows SELECT inside `toDomainFromRow` (`drizzle-practice-session-repository.ts:177-190`).
4. The read observes the session row (pre-delete snapshot) but zero question-state rows (post-delete snapshot). `toOrderedDomainQuestionStates` (`drizzle-practice-session-repository.ts:84-94`) throws `ApplicationError('INTERNAL_ERROR', '... is missing normalized question state')` instead of the clean `NOT_FOUND`/`CONFLICT` this code path is designed to produce — surfacing as an unhandled 500 to the user mid-finalize.

## Root Cause

Before this PR, a practice session's question state lived in one JSON blob column read by a single atomic SELECT — no torn-read was possible. Track A's split into parent (`practice_sessions`) + child (`practice_session_question_states`) rows reintroduced the classic two-statement torn-read hazard. The `repeatable read` wrapper added to close it does not work in the one place it is actually exercised: a nested call inside an already-open write transaction.

## Fix

TBD — options:
- Make `inRepeatableRead` detect it's already inside a transaction and skip the redundant nested call, relying on the outer transaction's isolation level being set correctly from the start.
- Have the top-level `writeTransaction` callers (`lib/container/use-cases.ts`) open their outer transaction at `repeatable read` directly.
- Replace the two sequential SELECTs in `toDomainFromRow` with a single joined query so there is no window between them regardless of isolation level.

## Verification

- [ ] Integration test that interleaves a concurrent session-delete with an in-flight finalize transaction and asserts a clean `NOT_FOUND`/`CONFLICT`, not `INTERNAL_ERROR`
- [ ] Confirm (e.g. via `pg_stat_activity` / driver-level assertion) that the nested call now actually runs at `repeatable read`, or that the architecture no longer depends on it

## Related

- PR #537, [DEBT-425](../debt/debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/drizzle-practice-session-repository.ts:154-160`
- `src/application/use-cases/finalize-exam-answers.ts:119`
- `lib/container/use-cases.ts:41-55`
