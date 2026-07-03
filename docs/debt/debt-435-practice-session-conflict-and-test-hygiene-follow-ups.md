# DEBT-435: Practice-session conflict semantics and post-Track-A test hygiene follow-ups

**Status:** Open
**Priority:** P3
**Created:** 2026-07-02
**Related:** [DEBT-426](./debt-426-session-wide-lock-defeats-row-concurrency.md), [DEBT-425](../_archive/debt/debt-425-legacy-compatibility-tolerances-audit.md), [PR #537](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/537)

---

## Context

Track A replaced the legacy practice-session JSON state blob with normalized `practice_session_question_states` rows and row-version conflict handling. The large refactor landed cleanly, but the close-out review found a small set of follow-ups that are too narrow to justify separate debt docs. Three are test/fake hygiene and are resolved by the consolidation PR that filed this doc; one is a real product-behavior design decision and remains active here.

---

## Findings / Evidence

1. **Fake/real conflict drift (resolved in this consolidation PR).** At filing time, `FakePracticeSessionRepository` used old `INTERNAL_ERROR` fallback messages for impossible state-persist misses, while the real adapter maps exhausted row-version state updates to `ApplicationError('CONFLICT', 'Practice session state changed concurrently; please retry.')` (`practice-session-question-state-updater.ts:212-215`). This consolidation branch aligns the fake fallback contract with the real adapter.
2. **SubmitAnswer stale test contract (resolved in this consolidation PR).** At filing time, `src/application/use-cases/submit-answer-tutor.test.ts` pinned `INTERNAL_ERROR` propagation through a fake failing record path, leaving no use-case-level fake-backed proof that session-state write `CONFLICT`s propagate unchanged. This consolidation branch updates that contract.
3. **Idempotency caches transient `CONFLICT`s (active).** Session-review/finalize flows use idempotency keys that clear only on success. The generic idempotency wrapper stores execute errors via `repo.storeError()` (`src/adapters/shared/with-idempotency.ts:136-144`) and replays cached errors as `ApplicationError(existing.error.code, existing.error.message)` (`src/adapters/shared/with-idempotency.ts:181-183`). A transient practice-session state-write `CONFLICT` can therefore be stored and replayed for the same idempotency key instead of letting an immediate retry execute fresh. That may be acceptable, but it is a product semantics decision: are transient state-write conflicts cacheable terminal outcomes, or should this class clear/avoid the idempotency cache?
4. **Test robustness gaps (resolved in this consolidation PR).** At filing time, the BUG-267/268 transaction-isolation integration test did not reset observed transaction depths after setup; the BUG-266/270 seed-choice integration cleanup could skip later cleanup if an earlier cleanup promise rejected; `reset-e2e-user-state.test.ts` asserted part of the baseline verification SQL but did not pin the incomplete-session predicate; and `lib/container-practice-session-state-transactions.test.ts` covered retryable transaction failures but not the negative path that non-retryable `ApplicationError`s are not retried. This consolidation branch hardens those tests without changing production behavior.

---

## Decision

Keep this debt active only for item 3. Items 1, 2, and 4 are small hygiene fixes and should be closed in the same branch that files this doc. Do not fold item 3 into DEBT-426 unless the DEBT-426 redesign changes the idempotency surface directly; it needs an explicit product/adapter decision about cache semantics for transient concurrency errors.

---

## Plan / DoD

- [x] Align fake state-persist fallback errors with the real adapter's transient state-write `CONFLICT` contract.
- [x] Update `SubmitAnswerUseCase` tutor coverage to prove session-state `CONFLICT` propagation through the fake-backed transaction seam.
- [x] Harden the four review-identified test gaps without changing production behavior.
- [ ] Decide whether transient practice-session state-write `CONFLICT`s should be stored by idempotency wrappers. If they should not be cached, implement the policy at the idempotency/controller adapter seam with red-first tests proving retryable/transient `CONFLICT`s clear or bypass the cached-error path while terminal conflicts still replay deterministically.

---

## Verification

Resolved hygiene items should be covered by focused unit/integration tests plus the full quality gate. The remaining active item clears only when the idempotency semantics are explicitly decided and tested.
