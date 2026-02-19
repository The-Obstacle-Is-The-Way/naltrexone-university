# DEBT-237: Extract Reconciliation Test Factory to Reduce Boilerplate

**Status:** Open
**Priority:** P4
**Date:** 2026-02-19
**Component:** `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)

---

## Description

`src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` is 1,085 lines with 18 `it()` tests — a lines-per-test ratio of 60.3, the highest among currently open >1,000-line test debt items.

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

This should reduce the file to ~850 lines while making each test's unique scenario immediately visible.

## Verification

- [ ] All 18 existing tests pass unchanged
- [ ] Lines-per-test ratio drops below 50
- [ ] File is under 1,000 lines
- [ ] Each test's unique scenario is immediately apparent without scrolling past setup

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
- [DEBT-236](debt-236-extract-reconciliation-concurrency-utility.md) — Companion: production file refactor
