# BUG-292: discard() Opens a Repository-Owned REPEATABLE READ Transaction With No Serialization-Failure Retry or Mapping

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Practice / discard

---

## Summary

[`DrizzlePracticeSessionRepository.discard`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539-L567) runs both guarded DELETEs (child `practice_session_question_states` rows, then the parent `practice_sessions` row) inside a self-opened `{ isolationLevel: 'repeatable read' }` transaction with no try/catch and no postgres-error mapping. Every other REPEATABLE READ practice-session write is routed through the composition root's [`runPracticeSessionStateWriteTransaction`](../../lib/container/use-cases.ts#L79-L109), whose retryable set is exactly `'40001'`/`'40P01'` ([use-cases.ts#L47-L50](../../lib/container/use-cases.ts#L47-L50)) — the contract [DEBT-441's resolution documents](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md): repositories bound to a composition-root RR transaction have their serialization failures owned by that runner. But [`DiscardPracticeSessionUseCase` is wired without it](../../lib/container/use-cases.ts#L157-L160), so discard is the one RR practice-session write with no serialization-failure owner.

[BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md)'s fix removed the AB-BA deadlock (child-first delete ordering) and stopped caching transient discard errors under the fixed idempotency key, but its remediation option 2 — retry-or-mapping on the discard path — was never implemented, and no doc rules the remaining 40001 path accepted. When a discard races a concurrent retry-wrapped finalize and the finalize commits first, Postgres raises raw `40001`; it escapes the repository port uncaught and the user sees a generic `INTERNAL_ERROR`, when one retry would have converged to the use case's documented idempotent success.

## Reachability

Any signed-in user with an in-flight exam session whose timer has expired. The expired-exam auto-finalizer runs from within `getNextQuestion` ([get-next-question.ts#L181-L189](../../src/application/use-cases/get-next-question.ts#L181-L189)), retry-wrapped under REPEATABLE READ via `runPracticeSessionStateWriteTransaction`. If the user concurrently clicks Discard on the incomplete-session prompt (another tab, or the same tab's abandon flow), the two writes race. The discard and the finalize use different idempotency actions/keys, so the with-idempotency claim fence does not serialize them against each other. Preconditions are narrow — an expired exam plus a discard landing inside the finalize's commit window — hence P3.

## Reproduction

Exact interleaving (a race; timing-dependent):

1. An exam session's timer expires with the session still open (`ended_at IS NULL`).
2. Tab A: a question load triggers the expired-exam auto-finalizer ([get-next-question.ts#L188](../../src/application/use-cases/get-next-question.ts#L188)), which begins a retry-wrapped REPEATABLE READ transaction ([use-cases.ts#L91-L94](../../lib/container/use-cases.ts#L91-L94)) and updates `practice_session_question_states` rows, then the parent `practice_sessions` row.
3. Tab B: the user clicks Discard. `discard()` opens its own REPEATABLE READ transaction ([drizzle-practice-session-repository.ts#L540](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L540)); its child-row DELETE ([#L542-L553](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L542-L553)) blocks on finalize's row locks.
4. Finalize commits. Under REPEATABLE READ, the blocked DELETE now fails with raw Postgres `40001` ("could not serialize access due to concurrent update").
5. No catch, no mapping, no retry exists on this path: the `PostgresError` propagates out of the repository and [use case](../../src/application/use-cases/discard-practice-session.ts#L39). The idempotency wrapper aborts the claim without caching, because [`shouldCachePracticeSessionLifecycleError`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L20) caches only typed `CONFLICT` errors (BUG-278 policy).
6. [`handleError`](../../src/adapters/controllers/action-result.ts#L74) maps the unknown error to `err('INTERNAL_ERROR', 'Internal error')`.

Expected: discard converges to its documented idempotent success — a single fresh-snapshot retry would observe `ended_at` set, both `ended_at IS NULL`-guarded DELETEs would match 0 rows, and the use case treats an absent/ended session as a no-op success ([discard-practice-session.ts#L24-L27](../../src/application/use-cases/discard-practice-session.ts#L24-L27)).

Actual: the user sees a generic "Internal error" on an operation the use case defines as idempotent.

Two corrections from adversarial verification of the original candidate: same-key double-click discard is **not** a live trigger (the with-idempotency claim loop serializes it), and the surfaced failure is a mapped generic `INTERNAL_ERROR` action result, **not** a raw HTTP 500.

## Root Cause

- [`discard()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L539-L567) self-opens `{ isolationLevel: 'repeatable read' }` ([#L565](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L565)) rather than inheriting a composition-root transaction, so the runner that owns `40001`/`40P01` ([use-cases.ts#L47-L50](../../lib/container/use-cases.ts#L47-L50), [#L79-L109](../../lib/container/use-cases.ts#L79-L109)) never sees its failures.
- The container wires [`createDiscardPracticeSessionUseCase`](../../lib/container/use-cases.ts#L157-L160) with a bare repository — no `runPracticeSessionStateWriteTransaction`, unlike `FinalizeExamAnswersUseCase` ([#L117-L132](../../lib/container/use-cases.ts#L117-L132)).
- For contrast, `end()` in the same file ([#L569-L611](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569-L611)) runs autocommit READ COMMITTED with full CAS-style error mapping to typed `NOT_FOUND`/`CONFLICT`/`INTERNAL_ERROR` — discard is uniquely the unowned RR write.
- [BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) shipped lock-order alignment plus uncached transient errors, and explicitly listed retry-or-mapping for the discard path as remediation option 2, which remained unimplemented.

## Impact

One uncached generic "Internal error" surfaced to the user on a narrow discard-vs-finalize race window. The failure is self-healing: the claim is aborted uncached (BUG-278 policy), so a user retry succeeds — by then the finalize has committed and discard returns its idempotent no-op success. No data loss or corruption; the session correctly ends via the finalize. Severity rationale: post-BUG-278 the blast radius is a single transient wrong-shaped error on an operation with hard timing preconditions — a reachable, observable defect but with no persistence or integrity consequence, hence P3 rather than P2.

## Proposed Fix

1. **(Recommended)** Give discard's serialization failures the same owner as every other RR practice-session write: catch `40001`/`40P01` around `discard()`'s transaction (or route the discard write through `runPracticeSessionStateWriteTransaction` via a tx-bound repository in the composition root) and retry with a fresh snapshot. The retry deterministically converges because both DELETEs are guarded by `ended_at IS NULL`, so a post-finalize retry deletes 0 rows and returns the use case's idempotent success. Keep the child-first delete ordering pinned by [`drizzle-practice-session-repository-session-writes.test.ts`](../../src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts).
2. Catch-and-map only: convert `40001`/`40P01` exhaustion to `ApplicationError('CONFLICT', ..., { reason: StateChangedConcurrently })` so at minimum a typed error crosses the port instead of a raw `PostgresError`. Smaller change, but still leaves one manual-retry burden on the user.
3. **Rejected:** do NOT downgrade discard to READ COMMITTED as a shortcut. EvalPlanQual re-evaluation of the `EXISTS`/`ended_at` guards probably yields the right no-op, but the two-statement delete's cross-statement consistency would then rest on subtle re-check semantics. If no-code-change is preferred, file a decision brief explicitly accepting the residual instead.

## Related

- [BUG-278 (archived, resolved PR #562)](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — nearest prior art; named the discard no-retry gap as contributing fact 3 and listed retry-or-mapping as remediation option 2, but the shipped fix covered only lock ordering and uncached transient errors. This is the residual, not a duplicate.
- [DEBT-441 (archived)](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) — documents the contract that composition-root-bound RR repositories have serialization failures owned by `runPracticeSessionStateWriteTransaction`; discard sits outside that contract.
- [DEBT-437 (archived, owner-ruled ACCEPT)](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — its ACCEPT ruling covers tutor-submit vs end write skew, a different surface; this finding is not reducible to it.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
