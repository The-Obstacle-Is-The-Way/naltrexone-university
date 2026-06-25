# BUG-262: First-Page Reconcile Failure Starves the Deleted-Account Stripe-Cancellation Drain

**Status:** Open
**Severity:** P4
**Date:** 2026-06-25
**Confirmed:** 2026-06-25
**Component:** Cron / Stripe reconciliation / Billing maintenance

---

## Summary

The daily billing-maintenance cron runs two independent maintenance tasks inside **one shared `try` block** — `reconcileAllStripeSubscriptionPages` first, then `drainPendingStripeCancellations`. The all-pages reconcile orchestrator **re-throws** when the *first* page fails. So a transient first-page reconcile failure (a Stripe outage or a DB hiccup on the initial `listLocalSubscriptions` query / first-row `subscriptions.retrieve`) aborts the whole cron *before the drain runs*, and the route returns 500.

The drain is the durable safety net for **BUG-246**: when a deleted Clerk account's post-commit Stripe cancellation fails, the cancellation is queued in `pending_stripe_cancellations` and retried by this daily drain. Coupling it behind the reconcile means a reconcile failure silently skips the drain for that cron cycle, leaving a deleted user's Stripe subscription billable for up to an extra ~24h.

## Reachability

Reachable in production whenever (a) the **first** reconcile page throws, and (b) at least one stale row exists in `pending_stripe_cancellations`. The first-page throw is exactly the Stripe-outage case: the shared module-level circuit breaker ([`stripe-retry.ts`](../../src/adapters/gateways/stripe/stripe-retry.ts)) opens on the first failing row, so a Stripe incident deterministically fails page 0 — maximizing overlap with the very condition (Stripe unhealthy) under which queued cancellations most need draining. Severity is P4 because it is **self-healing** on the next successful daily run and stays within the eventual-consistency envelope BUG-246 already accepted; there is no state corruption.

## Reproduction

1. Have ≥1 row in `pending_stripe_cancellations` (a deleted account whose webhook post-commit cancel failed — the BUG-246 path).
2. Make the first reconcile page throw — e.g. a Stripe outage that opens the circuit breaker on the first `subscriptions.retrieve`, or a DB error on the initial local-subscription list query.
3. The daily cron (`0 8 * * *`, `scope=all`) runs.

Expected: the deleted-account cancellation drain still runs (reconcile failure degrades the response but does not block the independent drain).

Actual: `reconcileAllStripeSubscriptionPages` re-throws on page 0, the shared `catch` returns 500, and `drainPendingStripeCancellations` is never called this cycle.

## Root Cause

The two maintenance tasks share one `try`/`catch`, reconcile-first:

- [`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L229) runs `reconcileAllStripeSubscriptionPages` (the `scope=all` cron path), then [`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L241) runs `drainPendingStripeCancellations` — both inside the same `try`.
- The all-pages orchestrator re-throws on a first-page failure: [`reconcile-all-stripe-subscription-pages.ts`](../../src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts#L154) (`if (aggregate.pagesScanned === 0) throw error`). Later-page failures only stop early; a page-0 failure propagates.
- The shared `catch` logs and returns 500 ([`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L258)), so the drain call at line 241 is unreachable once reconcile throws.

The behavior is pinned by the existing route test ["returns 500 when all-pages reconciliation throws before any page succeeds"](../../app/api/cron/reconcile-stripe-subscriptions/route.test.ts#L624) — it asserts the 500 but not that the drain still runs, which is the gap.

The cron cadence is daily: [`vercel.json`](../../vercel.json#L7) (`"schedule": "0 8 * * *"`, path `…?dryRun=false&scope=all`).

## Impact

A transient first-page reconcile failure skips the deleted-account cancellation drain for that day. Deleted-account Stripe subscriptions that failed their webhook post-commit cancellation remain active (billable) for up to one additional ~24h cron cycle until the next successful run. No state corruption, no user-facing app error, no cross-user exposure — purely a delayed ops safety-net, which is why it is P4. It nonetheless defeats the intent of BUG-246 (bounded eventual cancellation) precisely when Stripe is unhealthy.

## Proposed Fix

Decouple the two maintenance tasks so a reconcile failure cannot short-circuit the independent drain. Run `drainPendingStripeCancellations` in its **own** `try`/`catch`, after (and independent of) the reconcile result:

1. Wrap the reconcile call in its own `try`/`catch`; on failure, log + record a degraded reconcile outcome instead of throwing out of the handler.
2. Always run `drainPendingStripeCancellations` afterward in its own `try`/`catch`.
3. Aggregate both outcomes into the response body; return a partial/degraded status (and the appropriate HTTP code) reflecting which task(s) failed, rather than letting a reconcile throw skip the drain and return a bare 500.
4. Keep both tasks idempotent/resumable as they already are.

### Rejected alternatives

- **Run the drain *before* reconcile.** Just moves the coupling — a drain failure would then skip reconcile. Both must be independent.
- **Make the orchestrator not re-throw on page 0.** Loses the legitimate "total reconcile failure" signal and still leaves the two tasks coupled in one `try`.
- **Add a separate, more-frequent drain cron.** BUG-246 explicitly rejected standing up a second scheduler ("a second scheduler to observe, secure, and operate") and accepted the daily cadence; this fix keeps one cron and one schedule.

## Failing Test Sketch

```ts
it('still drains pending cancellations when the first reconcile page throws', async () => {
  // reconcile-all rejects before any page succeeds (page-0 failure)
  reconcileAllStripeSubscriptionPages.mockRejectedValueOnce(
    new Error('stripe unavailable'),
  );
  drainPendingStripeCancellations.mockResolvedValueOnce({ scanned: 1, drained: 1 });

  const res = await GET(authedCronRequest());

  // The drain MUST still run despite the reconcile failure...
  expect(drainPendingStripeCancellations).toHaveBeenCalledTimes(1);
  // ...and the response should report a degraded reconcile + a completed drain,
  // not a bare 500 that skipped the drain.
  expect(res.status).not.toBe(500);
});
```

Today this fails: the shared `try` lets the reconcile throw propagate to the `catch`, the drain is never invoked, and the route returns 500. Update the existing `route.test.ts:624` expectation accordingly once decoupled.

## Prior Bug Cross-Refs

- **BUG-246** (`docs/_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md`) — established the `pending_stripe_cancellations` queue + daily drain as the durable safety net for failed post-commit cancellations, and accepted the daily cadence. BUG-262 protects that net from being skipped by an unrelated reconcile failure; it does not change the cadence.
- **Audit #21** (Stripe/billing deep sweep) — noted the all-pages job "reports early stop" but did not cover the drain-coupling-to-first-page-throw interaction.
- **DEBT-422** — resume/keyset paging of the reconcile sweep (time-budget/offset). Separate concern from drain coupling; not affected by this fix.
