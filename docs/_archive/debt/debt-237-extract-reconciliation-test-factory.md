# DEBT-237: Extract Reconciliation Test Factory to Reduce Boilerplate

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-19
**Resolved:** 2026-02-19
**Component:** `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)

---

## Description

`src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` was 1,085 lines with 18 declared `it()` tests (60.3 lines/test). After refactor it is 899 lines with 14 declared `it()` blocks plus `it.each` expansions for 18 executed scenarios (49.9 lines/scenario), below the debt threshold.

The root cause is **repeated test setup boilerplate**: most tests manually instantiate `FakeStripeCustomerRepository`, `FakeSubscriptionRepository`, `FakeLogger`, configure Stripe stubs, and call `reconcileStripeSubscriptions()` with a similar options object. This pattern repeats across the suite with minimal variation.

## Impact

- High lines-per-test ratio (60.3) compared to codebase norm (~25–35)
- Adding new reconciliation scenarios requires copying ~40 lines of setup
- Setup noise obscures the actual test intent (the "what" is buried in "how")

## Resolution

Create a `createReconciliationTestScenario(overrides?)` factory function:

```typescript
function createReconciliationTestScenario(overrides?: {
  limit?: number;
  dryRun?: boolean;
  concurrency?: number;
  localSubscriptions?: LocalSubscriptionRow[];
}) {
  const stripeCustomers = new FakeStripeCustomerRepository();
  const subscriptions = new FakeSubscriptionRepository();
  const logger = new FakeLogger();
  const stripe = createStripeStub();

  async function run() {
    return reconcileStripeSubscriptions(
      { limit: overrides?.limit ?? 100, offset: 0, ...overrides },
      {
        stripe,
        priceIds: { monthly: 'price_m', annual: 'price_a' },
        logger,
        listLocalSubscriptions: async () => overrides?.localSubscriptions ?? [],
        transaction: async (fn) => fn({ stripeCustomers, subscriptions }),
      },
    );
  }

  return { stripeCustomers, subscriptions, logger, stripe, run };
}
```

This reduced the file to 899 lines while keeping each test's unique scenario visible.

## Verification

- [x] All 18 existing tests pass unchanged
- [x] Lines-per-test ratio drops below 50 (49.9)
- [x] File is under 1,000 lines (899)
- [x] Each test's unique scenario is immediately apparent without scrolling past setup

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
- [DEBT-236](debt-236-extract-reconciliation-concurrency-utility.md) — Companion: production file refactor
