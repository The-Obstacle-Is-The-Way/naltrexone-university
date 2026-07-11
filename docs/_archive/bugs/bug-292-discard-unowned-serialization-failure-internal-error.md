# BUG-292: `discard()` Owns a REPEATABLE READ Transaction With No Serialization-Failure Retry or Mapping

**Status:** Resolved
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-10 (Cycle B4 adversarial re-audit against `9afd936c`; core mechanism confirmed with corrected driver-error shape)
**Component:** Practice / discard

---

## Resolution (2026-07-11)

Fixed in PR #627 (squash `0c1221af` to dev), promoted via PR #629 (main `cca0470d`); production deploy succeeded and `https://addictionboards.com/` returned HTTP/2 200. `DiscardPracticeSessionUseCase` now runs its complete callback through `runPracticeSessionStateWriteTransaction` with a transaction-bound repository — a fresh REPEATABLE READ snapshot per bounded retry, `40001`/`40P01` only, typed `StateChangedConcurrently` CONFLICT on exhaustion — extending the DEBT-441 ownership contract to discard. Pinned by the barrier-orchestrated discard-vs-finalize interleaving in `tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts` (raw serialization failure pre-fix, idempotent convergence post-fix).


## Resolution State

Implemented in [PR #627](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/627) on branch `fix/bug-292-293-practice-session-races`; the bug remains Open pending merge and production proof.

## Summary

At the audited pre-fix head, [`DrizzlePracticeSessionRepository.discard`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539-L567) ran both guarded DELETEs (child `practice_session_question_states` rows, then the parent `practice_sessions` row) inside a self-opened `{ isolationLevel: 'repeatable read' }` transaction with no try/catch, retry, or PostgreSQL-error mapping. The two composition-root REPEATABLE READ state-write workflows — finalize and session-backed submit — instead ran through [`runPracticeSessionStateWriteTransaction`](../../../lib/container/use-cases.ts#L79-L109), whose retryable set is exactly `'40001'`/`'40P01'` ([use-cases.ts#L47-L50](../../../lib/container/use-cases.ts#L47-L50)). [DEBT-441's resolution](../debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) documents that transaction-bound updater failures belong to that runner. `DiscardPracticeSessionUseCase` was wired with a bare repository, so its repository-owned RR write had no equivalent serialization-failure owner.

PR #627 fixes that ownership gap: current [`createDiscardPracticeSessionUseCase`](../../../lib/container/use-cases.ts#L157-L162) runs the complete use-case callback through `runPracticeSessionStateWriteTransaction` with a transaction-bound repository. Each retry opens a fresh top-level REPEATABLE READ transaction; the repository's inner `transaction()` call is a savepoint that inherits the outer snapshot rather than a second retry owner. Exhausted `40001`/`40P01` failures map to the typed `StateChangedConcurrently` conflict, while unknown connection or commit failures still pass through without replay.

[BUG-278](./bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md)'s earlier fix removed the AB-BA deadlock (child-first delete ordering) and stopped caching transient discard errors, but its proposed remediation item 2 — retry or mapping on the discard path — was not part of that shipped resolution. Under the pre-fix behavior, when discard raced a retry-wrapped finalize and finalize committed first, PostgreSQL raised `40001`. With the installed `drizzle-orm@0.45.2` / `postgres@3.4.9` stack, the DELETE failure crossed the repository boundary as an uncaught Drizzle query error whose `cause` was the `PostgresError` carrying code `40001`; it was not a bare `PostgresError`. The controller ultimately returned generic `INTERNAL_ERROR`, although a fresh-snapshot retry of the discard transaction converged to its guarded no-op success after PR #627.

## Reachability

The pre-fix reachable path involved an entitled user with an in-flight exam session whose timer had expired. The expired-exam auto-finalizer runs from within `getNextQuestion` ([get-next-question.ts#L181-L189](../../../src/application/use-cases/get-next-question.ts#L181-L189)), and its write phase is retry-wrapped under REPEATABLE READ via `runPracticeSessionStateWriteTransaction`. If another tab concurrently submits Discard from the incomplete-session prompt, the two writes still race, because discard and finalize use different idempotency actions/keys. PR #627 now makes that race outcome-safe by giving discard the same bounded outer retry owner. Preconditions remain narrow — an expired exam plus a discard landing inside finalize's write/commit window — hence P3.

## Reproduction

Pre-fix interleaving (a race; timing-dependent):

1. An exam session's timer expires with the session still open (`ended_at IS NULL`).
2. Tab A: a question load triggered the expired-exam auto-finalizer ([get-next-question.ts#L188](../../../src/application/use-cases/get-next-question.ts#L188)), whose write phase began a retry-wrapped REPEATABLE READ transaction ([use-cases.ts#L91-L94](../../../lib/container/use-cases.ts#L91-L94)) and updated `practice_session_question_states` rows before the parent `practice_sessions` row.
3. Tab B: the user clicked Discard. The bare repository opened its own top-level REPEATABLE READ transaction; its child-row DELETE ([drizzle-practice-session-repository.ts#L542-L553](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L542-L553)) blocked on finalize's row locks.
4. Finalize committed. PostgreSQL's [Repeatable Read rules](https://www.postgresql.org/docs/current/transaction-iso.html) required the blocked DELETE to abort with `40001` (`could not serialize access due to concurrent update`) because its target row was changed after discard's snapshot.
5. No catch, mapping, or retry existed on that path: Drizzle wrapped the statement failure and the resulting query error propagated out of the repository and use case. The idempotency wrapper aborted the claim without caching because [`shouldCachePracticeSessionLifecycleError`](../../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L17-L28) returns false for every non-`ApplicationError` and for every non-terminal error.
6. [`handleError`](../../../src/adapters/controllers/action-result.ts#L74) mapped the unknown error to `err('INTERNAL_ERROR', 'Internal error')`.

Expected: discard converges to idempotent success. The implemented fresh-snapshot retry observes `ended_at` set, both `ended_at IS NULL`-guarded DELETEs match zero rows, the repository returns normally, and the use case returns `{ discarded: true }`. The use case explicitly treats an absent session as an early no-op ([discard-practice-session.ts#L31-L34](../../../src/application/use-cases/discard-practice-session.ts#L31-L34)); the ended-session no-op is supplied by the repository predicates.

Pre-fix actual: the user saw a generic "Internal error" on an operation the use case defines as idempotent.

Two corrections from adversarial verification of the original candidate: same-key double-click discard is **not** a live trigger (the with-idempotency claim loop serializes it), and the surfaced failure is a mapped generic `INTERNAL_ERROR` action result, **not** a raw HTTP 500.

## Root Cause

At the audited pre-fix head:

- [`discard()`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539-L567) self-opened `{ isolationLevel: 'repeatable read' }` rather than inheriting a composition-root transaction, so the runner that owned `40001`/`40P01` for finalize and session-backed submit never saw discard's failure.
- The container wired `createDiscardPracticeSessionUseCase` with a bare repository — no `runPracticeSessionStateWriteTransaction`, unlike `FinalizeExamAnswersUseCase`.
- [BUG-278](./bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) had shipped lock-order alignment plus uncached transient errors, while its retry-or-mapping remediation remained unimplemented.

The implemented ownership boundary is now the complete [`DiscardPracticeSessionUseCase.execute`](../../../src/application/use-cases/discard-practice-session.ts#L22-L49) callback. The composition root opens the retry-owned top-level transaction and supplies a transaction-bound repository; `discard()` therefore creates only a nested savepoint. The runner alone classifies `40001`/`40P01`, retries with a fresh snapshot, and maps exhaustion. The repository retains the child-first SQL ordering and has no competing retry loop.

## Impact

Before PR #627, one uncached generic "Internal error" surfaced to the user on a narrow discard-vs-finalize race window. The failure was self-healing: the claim was aborted uncached (BUG-278 policy), so a user retry succeeded after finalize committed. No data loss or corruption occurred; the session correctly ended via finalize. Severity rationale: post-BUG-278 the blast radius was a single transient wrong-shaped error on an operation with hard timing preconditions — a reachable, observable defect but with no persistence or integrity consequence, hence P3 rather than P2.

## Proposed Fix

1. **Recommended — implemented in PR #627:** assign the whole discard transaction one bounded retry owner for only `40001`/`40P01`, using the existing `getPostgresErrorCode` cause-unwrapping convention. The complete discard use-case callback now runs under the composition-root runner with a transaction-bound repository. Each retry opens a fresh top-level transaction/snapshot; no statement or nested savepoint owns a retry. Unknown connection/commit errors remain indeterminate and pass through rather than being blindly replayed. In the finalize race, a post-commit retry matches zero rows and returns idempotent success. Child-first ordering remains pinned by [`drizzle-practice-session-repository-session-writes.test.ts`](../../../src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts), and the real-Postgres regression forces the blocked DELETE/`40001` interleaving.
2. **Implemented in PR #627:** on bounded retry exhaustion, map the known `40001`/`40P01` failure through `practiceSessionStateChangedConcurrentlyError({ cause })`. That preserves the existing typed, non-cacheable `CONFLICT` reason instead of leaking the Drizzle query wrapper, while leaving one manual retry burden on the user.
3. **Rejected:** do not downgrade discard to READ COMMITTED as a shortcut. PostgreSQL re-evaluates a concurrently changed target row's predicate under Read Committed, but this method has two statements and a parent-table subquery; changing isolation would replace an explicit retry obligation with a more subtle cross-statement contract. Keep REPEATABLE READ and make its retry ownership explicit, or record an owner decision accepting the residual.

## Related

- [BUG-278 (archived, resolved PR #562)](./bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — nearest prior art; its root-cause fact 3 named the discard no-retry/no-mapping gap and proposed-fix item 2 listed retry or mapping, while the recorded resolution shipped lock ordering and uncached transient errors. This is the residual, not a duplicate.
- [DEBT-441 (archived)](../debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) — documents the contract that composition-root-bound RR repositories have serialization failures owned by `runPracticeSessionStateWriteTransaction`; PR #627 extends that ownership model to discard.
- [DEBT-437 (archived, owner-ruled ACCEPT)](../debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — its ACCEPT ruling covers tutor-submit vs end write skew, a different surface; this finding is not reducible to it.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
