# DEBT-219: Sequential Stripe API Calls in Reconciliation Cron Job

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Backend — Stripe Reconciliation Job

---

## Summary

`reconcileStripeSubscriptions()` currently serializes all I/O inside a `for (const row of rows)` loop:

- Per row: `subscriptions.retrieve` (via `retrieveAndNormalizeStripeSubscription`) then `subscriptions.list`
- Per "blocking" subscription found by that list: an additional `subscriptions.retrieve`
- Per duplicate id (when `dryRun=false`): `subscriptions.cancel`
- Per row: a `deps.transaction()` database upsert (line 229)

This makes wall-clock roughly the **sum of Stripe network latencies + database write latencies**, all serialized. With moderate volume this can approach the cron route's `maxDuration = 60`.

## Affected Code

- Job: `src/adapters/jobs/reconcile-stripe-subscriptions.ts` (`reconcileStripeSubscriptions()`)
- Cron route: `app/api/cron/reconcile-stripe-subscriptions/route.ts` (`maxDuration = 60`)

## Current Behavior (Sequential)

```typescript
for (const row of rows) {                                         // line 58
  const local = await retrieveAndNormalizeStripeSubscription(...);  // Stripe retrieve (line 61)

  const listed = await callStripeWithRetry(...);                    // Stripe list (line 98)

  for (const blockingId of blockingSubscriptionIds) {               // line 121
    const blocking = await retrieveAndNormalizeStripeSubscription(...); // Stripe retrieve per blocker
  }

  if (!dryRun && duplicateIds.length > 0) {
    for (const duplicateId of duplicateIds) {
      await callStripeWithRetry(...);                               // Stripe cancel (line 202)
    }
  }

  await deps.transaction(...);                                      // DB upsert (line 229)
}
```

Each row does **at minimum 1 retrieve + 1 list** (2 Stripe calls), plus an additional retrieve per blocking subscription found. A row with 3 blocking subscriptions makes 5 Stripe calls before any cancellations. With `limit=500` rows, worst-case serialized Stripe calls number in the thousands — plus one DB transaction per row.

## Why It's Acceptable Today (But Risky)

- This runs as a cron job (not a user request path), protected by Bearer token auth + route-level rate limiting (`cron:reconcile-stripe-subscriptions` key).
- The cron route exports `maxDuration = 60`, so the timeout budget is explicit.
- Many rows may have zero blocking subscriptions (only statuses in `BLOCKING_STATUSES` — `active`, `trialing`, `past_due`, `unpaid`, `incomplete`, `paused` — trigger the blocking path), so real-world call counts are often lower than worst-case.
- Stripe calls use `callStripeWithRetry()` (`maxAttempts: 3`, exponential backoff: 100 ms → 200 ms → 400 ms, `maxDelayMs: 1000`). But the retry helper has **no jitter**, so concurrent retries can bunch up and amplify 429s.

## Suggested Fix

Introduce **bounded parallelism** when reconciling `rows`, while preserving per-row isolation and failure aggregation.

Example shape (implementation detail can vary):

```typescript
const CONCURRENCY = 10;

const results = await mapWithConcurrencyLimit(rows, CONCURRENCY, async (row) => {
  try {
    await reconcileRow(row); // existing per-row logic
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      stripeSubscriptionId: row.stripeSubscriptionId,
      error,
    };
  }
});
```

Notes:

- Prefer `Promise.allSettled`-style aggregation (do not fail-fast) so one bad subscription does not abort the batch.
- Each row's `deps.transaction()` call also moves into the per-row callback; concurrent transactions are safe here because each row upserts its own customer/subscription records.
- Keep `subscriptions.cancel` for duplicates either sequential per-customer (safest) or separately bounded (low concurrency).
- Consider a single shared limiter for **all** Stripe calls in this job (retrieve/list/cancel) to avoid bursts.
- Adding jitter to `callStripeWithRetry()` would further reduce 429 clustering under concurrency.

## Acceptance Criteria

- [ ] Stripe calls are bounded (configurable concurrency, default 10)
- [ ] Batch continues on per-row failure; failures are reported in output
- [ ] `dryRun=true` behavior unchanged (no cancels)
- [ ] Job stays within route `maxDuration` under production counts
- [ ] Unit tests remain stable (may need to stop asserting call order)

---

## Related

- `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` — job behavior coverage
- `app/api/cron/reconcile-stripe-subscriptions/route.ts` — cron maxDuration + rate limiting
- `src/adapters/gateways/stripe/stripe-retry.ts` — retry logic for transient failures
- `docs/_archive/specs/spec-029-dev-environment-resilience.md` — `maxDuration` rationale
