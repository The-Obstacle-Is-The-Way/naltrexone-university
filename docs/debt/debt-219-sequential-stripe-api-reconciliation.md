# DEBT-219: Sequential Stripe API Calls in Reconciliation Cron Job

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Backend — Stripe Reconciliation Job

---

## Summary

The reconciliation cron job in `reconcile-stripe-subscriptions.ts` makes sequential Stripe API calls inside a `for` loop. Each subscription retrieval must complete before the next one starts, causing O(n) latency instead of O(1) with bounded parallelism.

## Affected File

- `src/adapters/jobs/reconcile-stripe-subscriptions.ts:58-260`

## Current Behavior

```typescript
for (const row of rows) {
  const update = await retrieveAndNormalizeStripeSubscription(...); // Sequential
  // ... process ...
  for (const blockingId of blockingSubscriptionIds) {
    const blockingUpdate = await retrieveAndNormalizeStripeSubscription(...); // Also sequential
  }
}
```

With 100+ subscriptions, each taking ~200-500ms, this can take 20-50+ seconds.

## Why It's Acceptable Today

- This runs as a cron job, not on a request path
- The `maxDuration: 60` export gives it up to 60 seconds
- Stripe rate limits (100 req/s for live mode) could be hit with full parallelism

## Suggested Fix

Use bounded parallelism (e.g., `Promise.all` with chunks of 10):

```typescript
const chunks = chunkArray(rows, 10);
for (const chunk of chunks) {
  await Promise.all(chunk.map(row => processRow(row)));
}
```

## Acceptance Criteria

- [ ] Reconciliation uses bounded parallel Stripe API calls
- [ ] Stripe rate limits are respected (max 10-20 concurrent requests)
- [ ] Job completes within `maxDuration` for production subscription counts
- [ ] Error handling per-subscription is preserved (one failure doesn't block others)

---

## Related

- `src/adapters/gateways/stripe/stripe-retry.ts` — retry logic for transient failures
- SPEC-029 — `maxDuration: 60` on the cron route
