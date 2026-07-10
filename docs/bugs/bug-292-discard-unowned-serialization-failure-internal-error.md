# BUG-292: `discard()` Owns a REPEATABLE READ Transaction With No Serialization-Failure Retry or Mapping

**Status:** Open
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-10 (Cycle B4 adversarial re-audit against `9afd936c`; core mechanism confirmed with corrected driver-error shape)
**Component:** Practice / discard

---

## Resolution State

Implemented in [PR #627](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/627) on branch `fix/bug-292-293-practice-session-races`; the bug remains Open pending merge and production proof.

## Summary

[`DrizzlePracticeSessionRepository.discard`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539-L567) runs both guarded DELETEs (child `practice_session_question_states` rows, then the parent `practice_sessions` row) inside a self-opened `{ isolationLevel: 'repeatable read' }` transaction with no try/catch, retry, or PostgreSQL-error mapping. The two composition-root REPEATABLE READ state-write workflows — finalize and session-backed submit — instead run through [`runPracticeSessionStateWriteTransaction`](../../lib/container/use-cases.ts#L79-L109), whose retryable set is exactly `'40001'`/`'40P01'` ([use-cases.ts#L47-L50](../../lib/container/use-cases.ts#L47-L50)). [DEBT-441's resolution](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) documents that transaction-bound updater failures belong to that runner. [`DiscardPracticeSessionUseCase` is wired with a bare repository](../../lib/container/use-cases.ts#L157-L160), so its repository-owned RR write has no equivalent serialization-failure owner.

[BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md)'s fix removed the AB-BA deadlock (child-first delete ordering) and stopped caching transient discard errors, but its proposed remediation item 2 — retry or mapping on the discard path — was not part of the shipped resolution. When discard races a retry-wrapped finalize and finalize commits first, PostgreSQL raises `40001`. With the installed `drizzle-orm@0.45.2` / `postgres@3.4.9` stack, the DELETE failure crosses the repository boundary as an uncaught Drizzle query error whose `cause` is the `PostgresError` carrying code `40001`; it is not a bare `PostgresError`. The controller ultimately returns generic `INTERNAL_ERROR`, although a fresh-snapshot retry of the discard transaction would converge to its guarded no-op success.

## Reachability

Any entitled user with an in-flight exam session whose timer has expired. The expired-exam auto-finalizer runs from within `getNextQuestion` ([get-next-question.ts#L181-L189](../../src/application/use-cases/get-next-question.ts#L181-L189)), and its write phase is retry-wrapped under REPEATABLE READ via `runPracticeSessionStateWriteTransaction`. If another tab concurrently submits Discard from the incomplete-session prompt, the two writes race. Discard and finalize use different idempotency actions/keys, so the idempotency claim fence does not serialize them against each other. Preconditions are narrow — an expired exam plus a discard landing inside finalize's write/commit window — hence P3.

## Reproduction

Exact interleaving (a race; timing-dependent):

1. An exam session's timer expires with the session still open (`ended_at IS NULL`).
2. Tab A: a question load triggers the expired-exam auto-finalizer ([get-next-question.ts#L188](../../src/application/use-cases/get-next-question.ts#L188)), whose write phase begins a retry-wrapped REPEATABLE READ transaction ([use-cases.ts#L91-L94](../../lib/container/use-cases.ts#L91-L94)) and updates `practice_session_question_states` rows before the parent `practice_sessions` row.
3. Tab B: the user clicks Discard. `discard()` opens its own REPEATABLE READ transaction ([drizzle-practice-session-repository.ts#L540](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L540)); its child-row DELETE ([#L542-L553](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L542-L553)) blocks on finalize's row locks.
4. Finalize commits. PostgreSQL's [Repeatable Read rules](https://www.postgresql.org/docs/current/transaction-iso.html) require the blocked DELETE to abort with `40001` (`could not serialize access due to concurrent update`) because its target row was changed after discard's snapshot.
5. No catch, mapping, or retry exists on this path: Drizzle wraps the statement failure and the resulting query error propagates out of the repository and [use case](../../src/application/use-cases/discard-practice-session.ts#L39). The idempotency wrapper aborts the claim without caching because [`shouldCachePracticeSessionLifecycleError`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L17-L28) returns false for every non-`ApplicationError` and for every non-terminal error.
6. [`handleError`](../../src/adapters/controllers/action-result.ts#L74) maps the unknown error to `err('INTERNAL_ERROR', 'Internal error')`.

Expected: discard converges to idempotent success. A fresh-snapshot retry would observe `ended_at` set, both `ended_at IS NULL`-guarded DELETEs would match zero rows, the repository would return normally, and the use case would return `{ discarded: true }`. The use case explicitly treats only an absent session as an early no-op ([discard-practice-session.ts#L24-L27](../../src/application/use-cases/discard-practice-session.ts#L24-L27)); the ended-session no-op is supplied by the repository predicates.

Actual: the user sees a generic "Internal error" on an operation the use case defines as idempotent.

Two corrections from adversarial verification of the original candidate: same-key double-click discard is **not** a live trigger (the with-idempotency claim loop serializes it), and the surfaced failure is a mapped generic `INTERNAL_ERROR` action result, **not** a raw HTTP 500.

## Root Cause

- [`discard()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539-L567) self-opens `{ isolationLevel: 'repeatable read' }` ([#L565](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L565)) rather than inheriting a composition-root transaction, so the runner that owns `40001`/`40P01` for finalize and session-backed submit ([use-cases.ts#L47-L50](../../lib/container/use-cases.ts#L47-L50), [#L79-L109](../../lib/container/use-cases.ts#L79-L109)) never sees discard's failure.
- The container wires [`createDiscardPracticeSessionUseCase`](../../lib/container/use-cases.ts#L157-L160) with a bare repository — no `runPracticeSessionStateWriteTransaction`, unlike `FinalizeExamAnswersUseCase` ([#L117-L132](../../lib/container/use-cases.ts#L117-L132)).
- For contrast, standalone `end()` in the same file ([#L569-L611](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569-L611)) uses a guarded autocommit UPDATE and reclassifies a zero-row result as typed `NOT_FOUND`/`CONFLICT`/`INTERNAL_ERROR`. It does not map arbitrary statement failures; the relevant distinction is that discard uniquely owns an RR write without an RR retry boundary.
- [BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) shipped lock-order alignment plus uncached transient errors, and explicitly listed retry-or-mapping for the discard path as remediation option 2, which remained unimplemented.

## Impact

One uncached generic "Internal error" surfaced to the user on a narrow discard-vs-finalize race window. The failure is self-healing: the claim is aborted uncached (BUG-278 policy), so a user retry succeeds — by then the finalize has committed and discard returns its idempotent no-op success. No data loss or corruption; the session correctly ends via the finalize. Severity rationale: post-BUG-278 the blast radius is a single transient wrong-shaped error on an operation with hard timing preconditions — a reachable, observable defect but with no persistence or integrity consequence, hence P3 rather than P2.

## Proposed Fix

1. **Recommended:** assign the whole discard transaction one bounded retry owner for only `40001`/`40P01`, using the existing `getPostgresErrorCode` cause-unwrapping convention. Either retry the repository-owned top-level transaction or move the complete discard use-case callback under the composition-root runner with a transaction-bound repository. Each retry must open a fresh top-level transaction/snapshot; retrying one statement or one nested savepoint is insufficient. These PostgreSQL codes abort the transaction, so retry is outcome-safe; unknown connection/commit errors remain indeterminate and must stay uncached rather than be blindly replayed. In this exact finalize race, a post-commit retry matches zero rows and returns idempotent success. Keep child-first ordering pinned by [`drizzle-practice-session-repository-session-writes.test.ts`](../../src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts), and add a real-Postgres regression that forces the blocked DELETE/`40001` interleaving.
2. On bounded retry exhaustion, map the known `40001`/`40P01` failure through `practiceSessionStateChangedConcurrentlyError({ cause })`. That preserves the existing typed, non-cacheable `CONFLICT` reason instead of leaking the Drizzle query wrapper, while leaving one manual retry burden on the user.
3. **Rejected:** do not downgrade discard to READ COMMITTED as a shortcut. PostgreSQL re-evaluates a concurrently changed target row's predicate under Read Committed, but this method has two statements and a parent-table subquery; changing isolation would replace an explicit retry obligation with a more subtle cross-statement contract. Keep REPEATABLE READ and make its retry ownership explicit, or record an owner decision accepting the residual.

## Related

- [BUG-278 (archived, resolved PR #562)](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — nearest prior art; its root-cause fact 3 named the discard no-retry/no-mapping gap and proposed-fix item 2 listed retry or mapping, while the recorded resolution shipped lock ordering and uncached transient errors. This is the residual, not a duplicate.
- [DEBT-441 (archived)](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) — documents the contract that composition-root-bound RR repositories have serialization failures owned by `runPracticeSessionStateWriteTransaction`; discard sits outside that contract.
- [DEBT-437 (archived, owner-ruled ACCEPT)](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — its ACCEPT ruling covers tutor-submit vs end write skew, a different surface; this finding is not reducible to it.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
