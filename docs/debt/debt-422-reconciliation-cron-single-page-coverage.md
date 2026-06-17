# DEBT-422: Scheduled Stripe Reconciliation Only Scans the First Subscription Page

**Priority:** P2 (billing safety-net scalability; fix before the local subscription table can exceed one scheduled page)
**Created:** 2026-06-17
**Status:** Open
**Related:** [BUG-244 archived](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md), [BUG-245 archived](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md), [BUG-246 archived](../_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md), [DEBT-219 archived](../_archive/debt/debt-219-sequential-stripe-api-reconciliation.md), [DEBT-303 archived](../_archive/debt/debt-303-reconciliation-cancel-idempotency.md)

---

## Context

Audit #21 fixed the major Stripe/Billing bugs and scheduled the reconciliation safety net. The scheduled Vercel cron now invokes:

```json
"/api/cron/reconcile-stripe-subscriptions?dryRun=false"
```

That route is authenticated, rate-limited, and live. The remaining issue is coverage: the scheduled URL does not pass `limit` or `offset`, so the route defaults to `limit=100` and `offset=0`.

The reconciliation route then calls `reconcileStripeSubscriptions(...)` once, and the `listLocalSubscriptions` callback queries `stripe_subscriptions` ordered by `userId` with that same single `limit`/`offset` pair. As a result, the daily scheduled run repeatedly scans the first page of local subscriptions and never advances to page 2.

This is not a confirmed user-facing bug today: the app is pre-revenue / below the threshold, and normal checkout, webhook, and eager-sync paths still handle ordinary subscription state. It is active debt because the failure mode is deterministic once the local subscription table grows past the scheduled page size.

## Current Behavior

Verified against the live tree on 2026-06-17:

- `vercel.json` schedules `/api/cron/reconcile-stripe-subscriptions?dryRun=false`.
- `app/api/cron/reconcile-stripe-subscriptions/route.ts` defaults `limit` to `RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT` (`100`) and `offset` to `0`.
- The route calls `reconcileStripeSubscriptions(...)` exactly once per HTTP request.
- `src/adapters/jobs/reconcile-stripe-subscriptions.ts` asks `deps.listLocalSubscriptions({ limit, offset })` for exactly one page.
- The route's production `listLocalSubscriptions` callback orders by `stripeSubscriptions.userId` and applies that one `limit`/`offset`.

Therefore a scheduled run with more than 100 local subscription rows scans only the first 100 rows by `userId` sort order. Rows after that are covered only if an operator manually invokes the route with a later `offset`.

The deleted-account cancellation drain is not part of this page cap: the route calls `drainPendingStripeCancellations(...)` separately, and that repository lists stale pending cancellation rows directly. This debt is about the duplicate-subscription / Stripe-local-drift reconciliation safety net.

## Risk

P2 once the product starts scaling because reconciliation is the backstop for rare but high-value billing drift:

- duplicate active Stripe subscriptions that escaped the checkout guard;
- stale local subscription rows when webhook delivery or processing missed a transition;
- Stripe/customer mapping repair during scheduled maintenance.

It is not a P0/P1 bug because the primary billing paths remain guarded, and no concrete affected user exists today. Still, the fix is mechanical and should happen before the subscription count approaches the current page size.

## Recommended Fix

Keep `reconcileStripeSubscriptions({ limit, offset, dryRun, concurrency })` as the single-page primitive for manual/debug use, but add a scheduled maintenance orchestration path that sweeps all pages.

Recommended shape:

1. Add a small orchestrator around the existing job that starts at `offset=0`, calls the existing single-page job, accumulates `scanned`, `updated`, `failed`, and `failures`, then advances by `limit` until a page returns fewer than `limit` rows.
2. Preserve explicit manual page mode for operator calls that pass `offset` or an explicit `scope=page`.
3. Make the Vercel scheduled path use the all-pages mode by default, with bounded `limit`, existing concurrency clamps, and a defensive `maxPages` or time-budget escape hatch so the route cannot overrun Vercel's 60s max duration silently.
4. Keep `drainPendingStripeCancellations(...)` on the same authenticated scheduled route, but do not tie its coverage to subscription pagination.

Avoid the weak fix of only increasing the default limit to 500. That moves the cliff but keeps the same deterministic missed-page class.

## Acceptance Criteria

- [ ] The scheduled cron invocation in `vercel.json` covers every local `stripe_subscriptions` row without requiring a manual `offset`.
- [ ] Manual one-page reconciliation remains available for debugging / reruns.
- [ ] Unit tests prove a scheduled/default run with more than `RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT` local rows invokes later pages and aggregates results.
- [ ] Route tests prove explicit page mode still honors `limit`, `offset`, `dryRun`, and `concurrency`.
- [ ] Pending Stripe cancellation drain behavior remains uncapped by subscription pagination and is still covered by route tests.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` passes before merge; run `pnpm test:e2e` too when the local authenticated billing E2E environment is available.
