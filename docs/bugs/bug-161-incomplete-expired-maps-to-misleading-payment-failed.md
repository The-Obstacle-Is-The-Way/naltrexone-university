# BUG-161: Stripe `incomplete_expired` Maps to Misleading `paymentFailed` Status

**Status:** Open
**Priority:** P3
**Date:** 2026-02-25

---

## Description

Stripe's `incomplete_expired` subscription status is mapped to the domain status `paymentFailed`, which shares the entitlement reason path with `paymentProcessing` (from Stripe's `incomplete`). These two Stripe states have fundamentally different semantics:

- **`incomplete`**: Initial payment is still being processed (3D Secure pending, bank processing). The subscription may still succeed.
- **`incomplete_expired`**: The initial payment window has permanently closed (~23 hours). The subscription is irrecoverable and terminal — the user must start a new checkout. Stripe voids the open invoice and generates no further invoices.

Because `paymentFailed` is grouped with `paymentProcessing` in the entitlement reason logic (`check-entitlement.ts:24`), the redirect sends users with dead subscriptions to the pricing page with `reason=payment_processing`, displaying: **"Payment processing. It may take a moment for access to activate."** This is misleading — their subscription is dead, and waiting will not help.

**This bug fires for every `incomplete_expired` subscription for up to ~30 days** because Stripe does NOT reset `current_period_end` when transitioning to `incomplete_expired`. The billing period dates remain set to the original values (e.g., creation + 1 month), so `hasActiveSubscriptionPeriod` evaluates to `true` for the duration of the phantom period.

## Verified Caller Chain

1. Stripe fires `customer.subscription.updated` with `status: 'incomplete_expired'`
2. `stripe-subscription-status.ts:9` maps `incomplete_expired` → `paymentFailed`
3. Webhook stores subscription with `status = 'paymentFailed'`
4. User visits app → `enforceEntitledAppUser` → `CheckEntitlementUseCase.execute`
5. `isEntitled(subscription, now)` returns `false` (correct — `paymentFailed` not in `EntitledStatuses`)
6. `getNonEntitledReason('paymentFailed', hasActiveSubscriptionPeriod)`:
   - If period end is in the future → returns `'payment_processing'`
   - User redirected to `/pricing?reason=payment_processing`
7. `getPricingBanner` shows: "Payment processing. It may take a moment for access to activate."

## Root Cause

`src/adapters/gateways/stripe/stripe-subscription-status.ts:7–16`:

```typescript
const stripeToDomain: Record<StripeSubscriptionStatus, SubscriptionStatus> = {
  incomplete: 'paymentProcessing',
  incomplete_expired: 'paymentFailed',  // ← lossy mapping
  // ...
};
```

The domain `SubscriptionStatus` enum lacks a distinct status for permanently failed/expired subscriptions. Both `incomplete` and `incomplete_expired` collapse into the same `paymentFailed` bucket.

Additionally, the reverse mapping at line 18–27 maps `paymentFailed` back to `incomplete_expired`, which is incorrect if the original Stripe status was `incomplete`.

## Impact

- **User confusion:** Users with expired incomplete subscriptions see "Payment processing" and may wait indefinitely instead of re-subscribing
- **Entitlement denial is correct** — no unauthorized access occurs
- **Revenue impact:** Users who need to re-subscribe may churn instead because the messaging doesn't tell them to act

## Scope

- Forward mapping: `incomplete_expired` → `paymentFailed` (semantic mismatch)
- Reverse mapping: `paymentFailed` → `incomplete_expired` (lossy round-trip)
- User messaging: `payment_processing` shown when `subscription_required` would be more accurate
- The reverse mapping is used by `subscriptionStatusToStripeSubscriptionStatus` in `DrizzleSubscriptionRepository.upsert` (line 72) for DB writes — currently safe because the round-trip preserves the value, but fragile if new domain statuses are introduced

### Second Affected Path

`app/(marketing)/checkout/success/checkout-success-sync.tsx:244–249` contains the same grouping:

```typescript
const reason =
  status === 'paymentProcessing' || status === 'paymentFailed'
    ? 'payment_processing'
    : 'manage_billing';
return redirectFn(`${ROUTES.PRICING}?reason=${reason}`);
```

If a user with an `incomplete_expired` subscription somehow reaches the checkout success page (e.g., via direct URL), they hit the same misleading message.

### Existing Test Encodes the Bug

`src/application/use-cases/check-entitlement.test.ts:120–138` explicitly tests that `paymentFailed` with an active period returns `payment_processing`. This test **encodes the current behavior as correct**, meaning the bug will not be caught by existing test coverage. The test must be updated as part of the fix.

## Suggested Fix

**Option A (minimal):** Update `getNonEntitledReason` to treat `paymentFailed` differently when the subscription period hasn't started yet (i.e., `currentPeriodEnd` is close to creation time), routing to `subscription_required` instead of `payment_processing`.

**Option B (proper):** Add a distinct domain status (e.g., `expired`) for permanently failed subscriptions. Map `incomplete_expired` → `expired` and update entitlement reason logic accordingly.

## Verification

- [ ] Unit test: `incomplete_expired` subscription → user sees `subscription_required` or clear "re-subscribe" messaging
- [ ] Verify `incomplete` still shows `payment_processing` (correct for pending payments)
- [ ] Integration test: webhook processes `incomplete_expired` → entitlement check returns correct reason

## Tracer-Bullet Verification (2026-02-25)

Full vertical and horizontal trace performed across 12+ files:

**Vertical (webhook → UI):** `stripe-webhook-processor.ts` → `stripe-subscription-normalizer.ts` → `stripe-subscription-status.ts` → `stripe-webhook-controller.ts` → `drizzle-subscription-repository.ts` → `check-entitlement.ts` → `app/layout.tsx` → `pricing/page.tsx`. Bug confirmed at every layer.

**Horizontal (all consumers):** `stripeSubscriptionStatusToSubscriptionStatus` has 5 callers (normalizer, DB read, checkout sync, test, barrel). `subscriptionStatusToStripeSubscriptionStatus` has 3 callers (DB write, test, barrel). `paymentFailed` referenced in 12 files. `payment_processing` reason in 12 files. All paths are consistent with the bug.

**Stripe behavior confirmed:** `incomplete_expired` retains `items.data[0].current_period_end` from the original billing period — Stripe does NOT reset it. The phantom period lasts ~30 days.

## Related

- `src/adapters/gateways/stripe/stripe-subscription-status.ts:9` — forward mapping
- `src/adapters/gateways/stripe/stripe-subscription-status.ts:20` — reverse mapping
- `src/application/use-cases/check-entitlement.ts:24` — reason logic grouping
- `src/application/use-cases/check-entitlement.test.ts:120` — test encoding the bug
- `app/(marketing)/checkout/success/checkout-success-sync.tsx:245` — second affected path
- `app/pricing/page.tsx:114–120` — banner messaging
- `src/adapters/repositories/drizzle-subscription-repository.ts:72` — reverse mapping usage
- BUG-077 — previous work on `paymentProcessing` messaging
