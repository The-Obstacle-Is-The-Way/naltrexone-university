# DEBT-435: Practice-session conflict semantics and post-Track-A test hygiene follow-ups

**Status:** Resolved
**Priority:** P3
**Created:** 2026-07-02
**Resolved:** 2026-07-03
**Related:** [DEBT-426](./debt-426-session-wide-lock-defeats-row-concurrency.md), [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md), [PR #537](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/537)

---

## Context

Track A replaced the legacy practice-session JSON state blob with normalized `practice_session_question_states` rows and row-version conflict handling. The large refactor landed cleanly, but the close-out review found a small set of follow-ups that were too narrow to justify separate debt docs. Three were test/fake hygiene items resolved by the consolidation PR that filed this doc; the remaining idempotency-cache semantics item was resolved by the 2026-07-03 tail sweep.

---

## Findings / Evidence

1. **Fake/real conflict drift (resolved in this consolidation PR).** At filing time, `FakePracticeSessionRepository` used old `INTERNAL_ERROR` fallback messages for impossible state-persist misses, while the real adapter maps exhausted row-version state updates to `ApplicationError('CONFLICT', 'Practice session state changed concurrently; please retry.')` (`practice-session-question-state-updater.ts:212-215`). This consolidation branch aligns the fake fallback contract with the real adapter.
2. **SubmitAnswer stale test contract (resolved in this consolidation PR).** At filing time, `src/application/use-cases/submit-answer-tutor.test.ts` pinned `INTERNAL_ERROR` propagation through a fake failing record path, leaving no use-case-level fake-backed proof that session-state write `CONFLICT`s propagate unchanged. This consolidation branch updates that contract.
3. **Idempotency cached transient `CONFLICT`s (resolved by this tail sweep).** Session-review/finalize flows use idempotency keys that clear only on success. Before resolution, the generic idempotency wrapper stored every execute error via `repo.storeError()` and replayed cached errors as `ApplicationError(existing.error.code, existing.error.message)`, which also dropped structured `details.reason` on replay. A transient practice-session state-write `CONFLICT` could therefore become a permanent same-key error instead of letting an immediate retry execute fresh.
4. **Test robustness gaps (resolved in this consolidation PR).** At filing time, the BUG-267/268 transaction-isolation integration test did not reset observed transaction depths after setup; the BUG-266/270 seed-choice integration cleanup could skip later cleanup if an earlier cleanup promise rejected; `reset-e2e-user-state.test.ts` asserted part of the baseline verification SQL but did not pin the incomplete-session predicate; and `lib/container-practice-session-state-transactions.test.ts` covered retryable transaction failures but not the negative path that non-retryable `ApplicationError`s are not retried. This consolidation branch hardens those tests without changing production behavior.

---

## Decision

Resolved by making cacheability explicit at the idempotency adapter seam. `withIdempotency` now accepts a generic `shouldCacheError` policy; practice-session state-writing controllers pass a policy that treats `details.reason === PracticeSessionConflictReasons.StateChangedConcurrently` as non-cacheable. Non-cacheable execution errors abort the exact still-pending idempotency claim using the DEBT-424 fenced `abortClaim` contract, so the same key can execute fresh on retry instead of being stranded pending or replaying a transient error. Terminal conflicts remain cacheable, and cached `ApplicationError.details` are persisted/replayed so future reason-consuming clients do not lose machine-readable context.

---

## Plan / DoD

- [x] Align fake state-persist fallback errors with the real adapter's transient state-write `CONFLICT` contract.
- [x] Update `SubmitAnswerUseCase` tutor coverage to prove session-state `CONFLICT` propagation through the fake-backed transaction seam.
- [x] Harden the four review-identified test gaps without changing production behavior.
- [x] Decide whether transient practice-session state-write `CONFLICT`s should be stored by idempotency wrappers. Decision: do **not** cache the transient state-write reason; abort the claim and let the same-key retry execute fresh. Terminal conflicts remain cached and replay with `details` intact.

---

## Verification

Focused coverage:

- `src/adapters/shared/with-idempotency.test.ts` proves transient state-write conflicts abort without caching, terminal conflicts replay with details intact, and legacy cached errors without details replay as before.
- `src/adapters/controllers/practice-controller-session-lifecycle.test.ts` proves the controller wiring: transient finalize conflicts execute fresh on same-key retry, while terminal finalize conflicts execute once and replay cached details.
- `src/adapters/repositories/drizzle-idempotency-key-repository.test.ts` and `tests/integration/idempotency-key-repository.integration.test.ts` prove fake/Drizzle persistence parity for cached error details.

Full gate required before merge.
