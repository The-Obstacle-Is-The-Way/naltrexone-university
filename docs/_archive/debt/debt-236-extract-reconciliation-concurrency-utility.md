# DEBT-236: Extract Concurrency Utility and Document Reconciliation Algorithm

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-19
**Resolved:** 2026-02-19
**Component:** `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
**Parent:** [DEBT-224](../../debt/debt-224-file-size-audit-production-and-test.md)

---

## Description

`src/adapters/jobs/reconcile-stripe-subscriptions.ts` is 315 lines and contains two mixed concerns:

1. **`mapWithConcurrencyLimit`** (lines 41–66) — A generic concurrency-bounded `Promise.all` utility that has no dependency on Stripe or subscriptions. This belongs in a shared utilities module.
2. **Reconciliation algorithm** (lines 68–315) — A dense, multi-phase algorithm (fetch → select canonical → cancel duplicates → upsert) with minimal inline documentation.

## Impact

- The concurrency utility is general-purpose but locked inside a domain-specific file
- The reconciliation algorithm's phases are not clearly separated or documented, making correctness audits harder
- The file is at 315 lines — extracting the utility (~25 lines) would bring it below the 300-line threshold

## Resolution

1. **Extract `mapWithConcurrencyLimit`** to `src/adapters/shared/concurrency.ts`
2. **Add phase comments** to the reconciliation algorithm documenting: validation/normalization → fetch canonical + blocking subs → select canonical via sort → cancel duplicates → upsert to DB
3. **Keep type-checking helpers grouped** (`toErrorMessage`, `toSafeInt`, `isBlockingStatus`) at the top of the module, and move to shared only if reuse emerges

Target: reduce the file to ~280 lines with clearer phase separation.

## Verification

- [x] `mapWithConcurrencyLimit` is importable from a shared module (`src/adapters/shared/concurrency.ts`)
- [x] All existing `reconcile-stripe-subscriptions.test.ts` tests pass unchanged
- [x] Reconciliation file is under 300 lines (`294` lines)
- [x] Algorithm phases are documented with inline comments

## Related

- [DEBT-224](../../debt/debt-224-file-size-audit-production-and-test.md) — Parent audit
- [DEBT-237](../../debt/debt-237-extract-reconciliation-test-factory.md) — Companion: test file boilerplate
