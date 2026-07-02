# BUG-267: Nested `inRepeatableRead` silently drops isolation level

**Status:** Resolved
**Priority:** P2
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Resolved:** 2026-07-01
**Scope:** Branch-local pre-merge defect in PR #537; fixed and verified before the Track A implementation shipped.

---

## Description

`DrizzlePracticeSessionRepository.inRepeatableRead()` calls `this.db.transaction(callback, { isolationLevel: 'repeatable read' })`. When `this.db` is already an open transaction, that call becomes a nested transaction / Postgres savepoint.

Verified directly in `node_modules/.../drizzle-orm/postgres-js/session.js`: the top-level `PostgresJsSession.transaction(transaction, config)` applies `config.isolationLevel` via `tx.setTransaction(config)`, but the nested `PostgresJsTransaction.transaction(transaction)` takes only one argument. It never receives or applies a config object. Before this fix, `FinalizeExamAnswersUseCase` and session-backed `SubmitAnswerUseCase` opened their outer write transactions at Postgres' default `READ COMMITTED`, so nested repository reads could silently run weaker than the repository method name promised.

## Root Cause

Track A split practice-session data into parent (`practice_sessions`) and child (`practice_session_question_states`) rows. The repository read helper correctly asked for `repeatable read` when it owned the top-level transaction, but the composition root constructed transaction-bound repositories inside already-open write transactions without setting the outer transaction isolation first.

## Resolution

Fixed on `chore/legacy-audit` before PR #537 merged by moving the invariant to the true transaction boundary:

- `lib/container/use-cases.ts` now opens both practice-session-state write transactions at `{ isolationLevel: 'repeatable read' }`: `FinalizeExamAnswersUseCase` and session-backed `SubmitAnswerUseCase`.
- `DrizzlePracticeSessionRepository.inRepeatableRead()` remains the repository-owned guard for top-level read methods. When the repository is constructed with an already-open transaction, nested savepoints inherit the outer transaction's isolation; the outer transaction is now correctly opened at `repeatable read`, so the nested driver limitation no longer weakens the finalize/submit flows.
- Residual caller-discipline hazard: this fix is enforced only at the two composition-root call sites, not structurally — a future call site that hands the repository an already-open `read committed` transaction would silently reintroduce the degraded-savepoint behavior. Any lock/transaction-shape redesign must preserve the boundary-owned isolation; tracked with [DEBT-426](../../debt/debt-426-session-wide-lock-defeats-row-concurrency.md), which owns that surface.
- `tests/integration/exam-timer.integration.test.ts`'s manual finalize wiring was aligned with the production composition-root isolation so integration tests do not keep a stale read-committed helper.

## Verification

- [x] `lib/container.test.ts` executes both affected use cases through the real container factory with fakes and asserts the outer `db.transaction(...)` call receives `{ isolationLevel: 'repeatable read' }`.
- [x] `tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts` wraps the real Drizzle DB, records `SHOW transaction_isolation` inside the actual transactions opened during `FinalizeExamAnswersUseCase.execute(...)`, and verifies the finalize execution observes `repeatable read`, not `read committed`.
- [x] Focused runs: `pnpm test --run scripts/seed-helpers.test.ts lib/container.test.ts`; `pnpm test:integration --run tests/integration/bug-regression-seed-choice-sync.integration.test.ts tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts tests/integration/exam-timer.integration.test.ts`.

## Related

- PR #537, [DEBT-425](../debt/debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `src/application/use-cases/finalize-exam-answers.ts`
- `src/application/use-cases/submit-answer.ts`
- `lib/container/use-cases.ts`
