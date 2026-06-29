# BUG-263: Billing Canonicalization Can Prefer a Non-Entitled Duplicate Subscription Over an Active Paid Subscription

**Status:** Open
**Severity:** P2
**Date:** 2026-06-28
**Confirmed:** 2026-06-28
**Component:** Billing / Stripe Reconciliation / Subscription Canonicalization
**Resolution State:** Fix implemented on `fix/bug-263-billing-canonicalization`; PR review and owner grade pending.

---

## Summary

When a Stripe customer has multiple blocking subscriptions, the reconciliation job chooses the canonical subscription by latest `currentPeriodEnd` only. The blocking set includes `incomplete`, `unpaid`, and `paused`, which map to non-entitled local states. If one of those non-entitled duplicates has a later period end than the user's active paid subscription, the nightly production cron can persist the non-entitled duplicate, cancel the active subscription, and revoke app access.

The same status-priority gap also exists in the shared subscription write guard used by Stripe webhooks and the checkout-success sync path: a different non-terminal, non-entitled subscription (`paymentProcessing`, `unpaid`, or `paused`) is allowed to overwrite a current entitled row because only terminal `canceled` / `paymentFailed` writes are blocked.

## Reachability

Reachable once a customer has duplicate blocking Stripe subscriptions for the same app user. The app has had historical duplicate-subscription bugs and the reconciliation job exists specifically to clean that state up; external Stripe dashboard/API actions can also create this shape. The production Vercel cron runs the reconciliation route with `dryRun=false` daily (`vercel.json:4-7`), so this is not a manual-only code path.

This is P2: the precondition is narrow, but the consequence is concrete billing/access harm for the affected user. The job can cancel an active paid Stripe subscription and persist a non-entitled row, after which app routes redirect the paid user away from the product.

## Reproduction

1. A user's local subscription row points to `sub_active` with Stripe status `active` and a future `currentPeriodEnd`.
2. The same Stripe customer also has a duplicate `sub_unpaid` (or `sub_incomplete` / `sub_paused`) with the same `metadata.user_id`, a configured price, and a later `current_period_end`.
3. The scheduled cron calls `/api/cron/reconcile-stripe-subscriptions?dryRun=false&scope=all`.
4. Reconciliation lists all blocking subscriptions, sorts by latest period end only, picks `sub_unpaid`, persists it, and cancels `sub_active`.
5. The user next opens an `/app/*` route.

Expected: a current entitled subscription should beat a non-entitled duplicate during canonical selection; the duplicate should be canceled and access preserved.

Actual: the non-entitled duplicate can win solely because its period end is later, so the active paid subscription is canceled and the app redirects the user to pricing/manage-billing.

## Root Cause

The reconciliation cron is scheduled in production with destructive mode enabled:

- [`vercel.json`](../../vercel.json#L4) defines the cron list.
- [`vercel.json`](../../vercel.json#L6) calls `/api/cron/reconcile-stripe-subscriptions?dryRun=false&scope=all`.
- [`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L228) invokes the all-pages reconciliation path.
- [`route.ts`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L234) calls `reconcileAllStripeSubscriptionPages(...)`.

The reconciler's blocking set includes non-entitled Stripe states:

- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L19) starts `BLOCKING_STATUSES`.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L23) includes `unpaid`.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L24) includes `incomplete`.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L25) includes `paused`.
- [`stripe-subscription-status.ts`](../../src/adapters/gateways/stripe/stripe-subscription-status.ts#L8) maps `incomplete` to `paymentProcessing`.
- [`stripe-subscription-status.ts`](../../src/adapters/gateways/stripe/stripe-subscription-status.ts#L14) maps `unpaid` to `unpaid`.
- [`stripe-subscription-status.ts`](../../src/adapters/gateways/stripe/stripe-subscription-status.ts#L15) maps `paused` to `paused`.

Those local states do not grant app access:

- [`subscription-status.ts`](../../src/domain/value-objects/subscription-status.ts#L29) defines entitled statuses as `active`, `inTrial`, and `pastDue`.
- [`subscription-status.ts`](../../src/domain/value-objects/subscription-status.ts#L40) still treats `unpaid`, `paymentProcessing`, and `paused` as blocking-checkout states.
- [`entitlement.ts`](../../src/domain/services/entitlement.ts#L17) returns false for a null subscription.
- [`entitlement.ts`](../../src/domain/services/entitlement.ts#L18) returns false when the status is not entitled.
- [`layout.tsx`](<../../app/(app)/app/layout.tsx#L42>) redirects non-entitled app users to pricing.

Canonical selection ignores that entitlement distinction:

- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L118) lists every subscription for the customer.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L130) filters to blocking subscription ids.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L183) enters canonical selection when any blocking id exists.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L190) sorts candidates by `currentPeriodEnd` only.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L194) uses subscription id only as a deterministic tie-break.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L223) persists the selected canonical subscription.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L230) writes the selected status to the user-keyed subscription row.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L240) begins duplicate cancellation for every non-winner.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L245) calls Stripe cancel for each duplicate.

The shared write guard lets the non-entitled duplicate persist over an active row:

- [`subscription-write-guard.ts`](../../src/domain/services/subscription-write-guard.ts#L9) defines only `canceled` and `paymentFailed` as terminal.
- [`subscription-write-guard.ts`](../../src/domain/services/subscription-write-guard.ts#L18) treats current entitled rows specially.
- [`subscription-write-guard.ts`](../../src/domain/services/subscription-write-guard.ts#L37) keeps same-row and non-current writes permissive.
- [`subscription-write-guard.ts`](../../src/domain/services/subscription-write-guard.ts#L41) allows any different incoming status that is not terminal, including `paymentProcessing`, `unpaid`, and `paused`.
- [`subscription-write-guard.test.ts`](../../src/domain/services/subscription-write-guard.test.ts#L131) explicitly asserts the current behavior for those three statuses.

The same guard is used by the repository that Stripe webhooks and checkout-success sync call:

- [`drizzle-subscription-repository.ts`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L90) calls `shouldPersistSubscriptionWrite(...)` before an upsert.
- [`stripe-webhook-controller.ts`](../../src/adapters/controllers/stripe-webhook-controller.ts#L124) handles subscription updates inside the webhook transaction.
- [`stripe-webhook-controller.ts`](../../src/adapters/controllers/stripe-webhook-controller.ts#L126) calls `subscriptions.upsert(...)`.
- [`checkout-success-sync.tsx`](<../../app/(marketing)/checkout/success/checkout-success-sync.tsx#L241>) calls the same repository during eager checkout-success sync.
- [`checkout-success-sync.tsx`](<../../app/(marketing)/checkout/success/checkout-success-sync.tsx#L262>) then derives the effective status from the write result.

Existing tests cover adjacent cases but not this one:

- [`reconcile-stripe-subscriptions.test.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.test.ts#L1083) covers a `past_due` duplicate replacing an active row; `pastDue` remains entitled, so it does not prove the non-entitled case safe.
- [`reconcile-stripe-subscriptions.test.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.test.ts#L1139) proves the job cancels the current local row when another candidate has the later period end.
- [`stripe-webhook-controller.test.ts`](../../src/adapters/controllers/stripe-webhook-controller.test.ts#L264) guards only superseded terminal webhooks.
- [`checkout-success/page.test.ts`](<../../app/(marketing)/checkout/success/page.test.ts#L1122>) guards only stale terminal checkout-success URLs.

## Impact

A paid user with an active Stripe subscription can lose app access and have that active subscription canceled by automated maintenance if a non-entitled duplicate has a later period end. The user is then redirected away from `/app/*` and may be blocked from starting a clean checkout while the non-entitled blocking row is current.

## Proposed Fix

Introduce one canonical subscription selection policy shared by reconciliation and the cross-subscription write guard:

1. Preserve same-subscription lifecycle updates exactly as today.
2. For different subscriptions while the stored row is current and entitled, reject incoming non-entitled statuses (`paymentProcessing`, `unpaid`, `paused`) the same way superseded terminal statuses are rejected.
3. In reconciliation, rank duplicate blocking candidates by status tier first, then by `currentPeriodEnd`, then by deterministic id:
   - tier 1: current entitled states (`active`, `trialing` / `inTrial`, `past_due` / `pastDue`)
   - tier 2: non-entitled but blocking/recoverable states (`incomplete`, `unpaid`, `paused`)
4. Cancel only the non-winning duplicates after the selected winner is the row that actually persisted or was already the current row.
5. Keep non-entitled states valid when no current entitled subscription exists; those rows still correctly block duplicate checkout and route the user to billing recovery.

Rationale: the bug is not "unpaid exists" by itself. The bug is allowing an unpaid/incomplete/paused duplicate to outrank a paid-access subscription for the same user. A status-aware selector preserves recovery states without letting them revoke a paid user who still has an entitled subscription.

Rejected alternatives:

- Treat `paymentProcessing`, `unpaid`, and `paused` as terminal everywhere: over-corrects and would break legitimate same-subscription recovery/lifecycle transitions.
- Patch only the reconciliation sort: leaves Stripe webhooks and checkout-success eager sync able to overwrite a current active row with a different non-entitled subscription.
- Disable duplicate cancellation: avoids the worst cancellation side effect but leaves duplicate billing state unresolved and does not fix local access revocation.
- Keep period-end-only canonical selection and rely on Stripe dashboard cleanup: preserves the exact automated failure mode this reconciliation job is meant to prevent.

## Failing Test Sketch

```ts
it('keeps an active subscription over a later unpaid duplicate during reconciliation', async () => {
  const active = createUserSubscriptionFixture('sub_active', {
    status: 'active',
    currentPeriodEnd: 1_800_000_000,
  });
  const unpaid = createUserSubscriptionFixture('sub_unpaid', {
    status: 'unpaid',
    currentPeriodEnd: 1_900_000_000,
  });
  const stripe = createStripeFromFixtures({
    fixtures: [{ fixture: active }, { fixture: unpaid }],
  });
  const scenario = createSingleRowScenario({
    stripe,
    subscriptionId: active.id,
  });

  await expect(scenario.run({ dryRun: false })).resolves.toMatchObject({
    scanned: 1,
    failed: 0,
  });

  await expect(
    scenario.subscriptions.findByExternalSubscriptionId('sub_active'),
  ).resolves.toMatchObject({ status: 'active' });
  await expect(
    scenario.subscriptions.findByExternalSubscriptionId('sub_unpaid'),
  ).resolves.toBeNull();
  expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
    'sub_unpaid',
    undefined,
    { idempotencyKey: 'reconcile_duplicate_subscription:sub_unpaid' },
  );
});
```

Today this fails because the period-end sort selects `sub_unpaid`, persists `unpaid`, and cancels `sub_active`.

Additional guards:

- `shouldPersistSubscriptionWrite` rejects a different `paymentProcessing` / `unpaid` / `paused` incoming write over a current entitled row, while preserving same-subscription transitions.
- `processStripeWebhook` does not let a different `unpaid` subscription overwrite a current active row.
- `syncCheckoutSuccess` does not let a stale or duplicate non-entitled success URL overwrite a current active row.
- Reconciliation still chooses the latest period end among two entitled candidates and among two non-entitled candidates when no entitled candidate exists.

## Resolution Notes

Implemented on `fix/bug-263-billing-canonicalization`:

- Added a pure domain canonicalization helper that ranks subscriptions by entitlement tier, then `currentPeriodEnd`, then deterministic subscription identity.
- Updated `shouldPersistSubscriptionWrite(...)` so a current entitled stored row rejects different-identity `paymentProcessing`, `unpaid`, and `paused` writes, while preserving same-subscription lifecycle updates, first-row writes, expired-row replacement, and different entitled canonical winners.
- Updated reconciliation Phase 3 to use the shared entitlement-tier comparator over normalized domain statuses. The raw Stripe blocking-status filter is unchanged.
- Added regression coverage for active-over-later `unpaid`, `incomplete`, and `paused` duplicates, a `dryRun=true` variant proving local canonical persistence is still status-aware, and a non-entitled-only preservation case.
- Added webhook and checkout-success guards proving the shared repository write guard prevents different non-entitled duplicates from replacing a current active row.

Dry-run note: `dryRun=true` suppresses Stripe duplicate cancellation only. The reconciliation job still persists the selected local canonical row in Phase 4, so the fix deliberately applies to local persistence in both dry-run and destructive runs.

## Prior Bug Cross-Refs

- [BUG-205](../_archive/bugs/bug-205-reconciliation-prefers-stale-local-subscription-over-canonical-stripe-state.md) fixed the earlier short-circuit that kept the local subscription without sorting the full blocking set. BUG-263 is the next layer: the full-set sort exists, but its status priority is wrong.
- [BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md) and [BUG-243](../_archive/bugs/bug-243-checkout-success-replay-overwrites-active-subscription.md) fixed stale terminal overwrites. BUG-263 covers non-terminal but non-entitled duplicate subscriptions.
- [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) fixed a normal in-app duplicate creation path. BUG-263 is about safely handling duplicate state that still exists or is created outside that path.
- [BUG-244](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md) made the reconciliation safety net run. This bug is inside what that scheduled safety net does once it runs.
