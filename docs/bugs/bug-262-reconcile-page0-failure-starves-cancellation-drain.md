# BUG-262: First-Page Reconcile Failure Starves the Deleted-Account Stripe-Cancellation Drain

**Status:** Open
**Severity:** P4
**Date:** 2026-06-25
**Confirmed:** 2026-06-25
**Component:** Cron / Stripe reconciliation / Billing maintenance
**Resolution State:** Fix implemented and CodeRabbit-approved (PR #520, squashed to `dev` as `5aac1d5d`; code approved on head `f79c3a57`). Promotion to `main` in progress (PR #521). This doc moves to `docs/_archive/bugs/` with **Status: Resolved** once the production deploy is verified.

---

## Summary

The daily billing-maintenance cron runs two independent maintenance tasks inside **one shared `try` block** — `reconcileAllStripeSubscriptionPages` first, then `drainPendingStripeCancellations`. The all-pages reconcile orchestrator **re-throws** when the *first* page fails. So a page-level first-page reconcile failure (for example, the initial `listLocalSubscriptions` query throwing or another setup/dependency failure outside the per-row reconciliation catch) aborts the whole cron *before the drain runs*, and the route returns 500.

The drain is the durable safety net for **BUG-246**: when a deleted Clerk account's post-commit Stripe cancellation fails, the cancellation is queued in `pending_stripe_cancellations` and retried by this daily drain. Coupling it behind the reconcile means a reconcile failure silently skips the drain for that cron cycle, leaving a deleted user's Stripe subscription billable for up to an extra ~24h.

## Reachability

Reachable in production whenever (a) the **first** reconcile page throws, and (b) at least one stale row exists in `pending_stripe_cancellations`. A single row-level Stripe failure is **not** enough to trigger this: `reconcileStripeSubscriptions` catches per-row errors and returns them in `{ failed, failures }`. The throwing case is a page-level failure before or outside that row catch, such as the initial local-subscription list query rejecting or the Stripe subscriptions API being unavailable. Severity is P4 because it is **self-healing** on the next successful daily run and stays within the eventual-consistency envelope BUG-246 already accepted; there is no state corruption.

## Reproduction

1. Have ≥1 row in `pending_stripe_cancellations` (a deleted account whose webhook post-commit cancel failed — the BUG-246 path).
2. Make the first reconcile page throw — e.g. reject the initial local-subscription list query or otherwise fail page setup before per-row reconciliation begins. A first-row `subscriptions.retrieve` error alone is not the right reproduction because row-level Stripe errors are caught and returned as failed rows.
3. The daily cron (`0 8 * * *`, `scope=all`) runs.

Expected: the deleted-account cancellation drain still runs (reconcile failure degrades the response but does not block the independent drain).

Actual: `reconcileAllStripeSubscriptionPages` re-throws on page 0, the shared `catch` returns 500, and `drainPendingStripeCancellations` is never called this cycle.

## Root Cause

The two maintenance tasks share one `try`/`catch`, reconcile-first:

- [`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L229) runs `reconcileAllStripeSubscriptionPages` (the `scope=all` cron path), then [`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L241) runs `drainPendingStripeCancellations` — both inside the same `try`.
- The all-pages orchestrator re-throws on a first-page failure: [`reconcile-all-stripe-subscription-pages.ts`](../../src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts#L154) (`if (aggregate.pagesScanned === 0) throw error`). Later-page failures only stop early; a page-0 failure propagates.
- Ordinary row-level Stripe failures are not this trigger: the page lists local rows before the row loop ([`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L67)), then catches per-row reconciliation errors and returns `{ ok: false }` rows ([`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L299)). Page-level setup failures outside that catch still reject the first page.
- The shared `catch` logs and returns 500 ([`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L258)), so the drain call at line 241 is unreachable once reconcile throws.

The behavior is pinned by the existing route test ["returns 500 when all-pages reconciliation throws before any page succeeds"](../../app/api/cron/reconcile-stripe-subscriptions/route.test.ts#L624) — it asserts the 500 but not that the drain still runs, which is the gap.

The cron cadence is daily: [`vercel.json`](../../vercel.json#L7) (`"schedule": "0 8 * * *"`, path `…?dryRun=false&scope=all`).

## Impact

A page-level first-page reconcile failure skips the deleted-account cancellation drain for that day. Deleted-account Stripe subscriptions that failed their webhook post-commit cancellation remain active (billable) for up to one additional ~24h cron cycle until the next successful run. No state corruption, no user-facing app error, no cross-user exposure — purely a delayed ops safety-net, which is why it is P4. It nonetheless defeats the intent of BUG-246 (bounded eventual cancellation) by letting one maintenance task starve another independent safety net.

## Proposed Fix

Decouple the two maintenance tasks so a reconcile failure cannot short-circuit the independent drain. Run `drainPendingStripeCancellations` in its **own** `try`/`catch`, after (and independent of) the reconcile result:

1. Wrap the reconcile call in its own `try`/`catch`; on failure, log + record a degraded reconcile outcome instead of throwing out of the handler.
2. Always run `drainPendingStripeCancellations` afterward in its own `try`/`catch`. Because the drain converts per-row cancellation errors into a `failed` count instead of throwing, treat the drain as failed when it either throws **or** returns `failed > 0` (a partial drain failure means a deleted-account subscription was not cancelled). Reconcile's per-row `failed` count is left as-is (routine eventual-consistency, retried next run), so only a thrown reconcile error marks reconcile failed.
3. Aggregate both outcomes into the response body; return a partial/degraded status (and the appropriate HTTP code) reflecting which task(s) failed, rather than letting a reconcile throw skip the drain and return a bare 500.
4. Keep both tasks idempotent/resumable as they already are.

### Rejected alternatives

- **Run the drain *before* reconcile.** Just moves the coupling — a drain failure would then skip reconcile. Both must be independent.
- **Make the orchestrator not re-throw on page 0.** Loses the legitimate "total reconcile failure" signal and still leaves the two tasks coupled in one `try`.
- **Add a separate, more-frequent drain cron.** BUG-246 explicitly rejected standing up a second scheduler ("a second scheduler to observe, secure, and operate") and accepted the daily cadence; this fix keeps one cron and one schedule.

## Failing Test Sketch

```ts
it('still drains pending cancellations when the first reconcile page throws', async () => {
  // A page-level first-page failure (e.g. the listLocalSubscriptions query
  // rejecting) — NOT a caught row-level Stripe error.
  reconcileAllStripeSubscriptionPages.mockRejectedValueOnce(
    new Error('list query failed'),
  );
  // Full drain payload per the contract (failed / failures / dryRun present).
  drainPendingStripeCancellations.mockResolvedValueOnce({
    scanned: 1,
    drained: 1,
    failed: 0,
    failures: [],
    dryRun: false,
  });

  const res = await POST(
    new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    }),
  );

  // The drain MUST still run despite the reconcile failure.
  expect(drainPendingStripeCancellations).toHaveBeenCalledTimes(1);
  // 500 because reconcile failed, but the structured body proves the drain ran.
  expect(res.status).toBe(500);
  await expect(res.json()).resolves.toEqual({
    error: 'Internal error',
    reconciliationFailed: true,
    drainFailed: false,
  });
});

// A sibling test exercises the partial-drain branch: when the drain resolves with
// `failed: 1`, the route marks `drainFailed: true` and returns 500.
```

Before the fix this failed because the shared `try` let the reconcile throw propagate to the `catch`, the drain was never invoked, and the route returned a bare 500. The regression test should assert the corrected contract: 500 with `reconciliationFailed: true`, `drainFailed: false`, and the drain invoked exactly once.

## Prior Bug Cross-Refs

- **BUG-246** (`docs/_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md`) — established the `pending_stripe_cancellations` queue + daily drain as the durable safety net for failed post-commit cancellations, and accepted the daily cadence. BUG-262 protects that net from being skipped by an unrelated reconcile failure; it does not change the cadence.
- **Audit #21** (Stripe/billing deep sweep) — noted the all-pages job "reports early stop" but did not cover the drain-coupling-to-first-page-throw interaction.
- **DEBT-422** — resume/keyset paging of the reconcile sweep (time-budget/offset). Separate concern from drain coupling; not affected by this fix.
