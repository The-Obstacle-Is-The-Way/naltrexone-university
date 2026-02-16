# DEBT-219: Sequential Stripe API Calls in Reconciliation Cron Job

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-16
**Resolved:** 2026-02-16
**GitHub Issue:** —

---

## Summary

`reconcileStripeSubscriptions()` originally processed local subscription rows serially, making total wall-clock time roughly the sum of per-row Stripe network latencies and DB writes. With moderate volume this could approach the cron route’s `maxDuration = 60`.

## Resolution

Introduced bounded parallelism for row reconciliation:

- Job: `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
  - Rows are processed with a default concurrency of `10` (clamped to a max of `25`)
  - Per-row failures are captured and returned (no fail-fast)
  - `dryRun=true` behavior remains unchanged (no cancels)
- Cron route: `app/api/cron/reconcile-stripe-subscriptions/route.ts`
  - Supports optional `concurrency` query param (job still applies bounds)

## Tests

- `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` — asserts default concurrency behavior
- `app/api/cron/reconcile-stripe-subscriptions/route.test.ts` — asserts `concurrency` param parsing

