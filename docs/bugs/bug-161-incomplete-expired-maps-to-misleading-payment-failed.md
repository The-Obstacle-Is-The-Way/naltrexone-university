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

## Fix: New Domain Status `subscriptionExpired`

**Decision:** Add a distinct domain status `subscriptionExpired` for permanently failed subscriptions (Option B). Option A (heuristic based on `createdAt` vs `currentPeriodEnd` proximity) was rejected — it depends on Stripe's ~23-hour expiration window, which is fragile and leaks Stripe lifecycle details into domain logic.

**No database migration required.** The DB stores Stripe statuses directly (`stripeSubscriptionStatusEnum` in `db/schema.ts:51–63`), not domain statuses. The mapping layer handles conversion.

### Changes Required (7 files)

**1. Domain — Add status** (`src/domain/value-objects/subscription-status.ts`)
```typescript
export const AllSubscriptionStatuses = [
  'paymentProcessing',
  'paymentFailed',
  'subscriptionExpired',  // ← NEW
  'inTrial', 'active', 'canceled', 'unpaid', 'paused', 'pastDue',
] as const;
// EntitledStatuses unchanged — subscriptionExpired is NOT entitled
```

**2. Adapter — Fix forward mapping** (`src/adapters/gateways/stripe/stripe-subscription-status.ts:9`)
```typescript
incomplete_expired: 'subscriptionExpired',  // was: 'paymentFailed'
```

**3. Adapter — Fix reverse mapping** (`src/adapters/gateways/stripe/stripe-subscription-status.ts:20`)
```typescript
subscriptionExpired: 'incomplete_expired',  // NEW entry
// paymentFailed: 'incomplete_expired'  ← REMOVE (paymentFailed no longer maps back)
```

Note: `paymentFailed` loses its reverse mapping. This is correct — `paymentFailed` is no longer produced by any Stripe status. If `paymentFailed` exists in old DB rows, they would have been stored as `incomplete_expired` at the Stripe level, which now maps to `subscriptionExpired` on read.

**4. Use case — Update reason logic** (`src/application/use-cases/check-entitlement.ts:24`)
```typescript
// Remove paymentFailed from the payment_processing group:
if (status === 'paymentProcessing') {
  return 'payment_processing';
}
if (status === 'subscriptionExpired') {
  return 'subscription_expired';  // NEW reason code
}
```

**5. Pricing page — Add banner** (`app/pricing/page.tsx`, after the `payment_processing` block)
```typescript
if (searchParams.reason === 'subscription_expired') {
  return {
    tone: 'warning',
    message: 'Your subscription has expired. Please subscribe again to continue.',
  };
}
```

**6. Checkout success — Update grouping** (`app/(marketing)/checkout/success/checkout-success-sync.tsx:244–249`)
```typescript
const reason =
  status === 'paymentProcessing'
    ? 'payment_processing'
    : status === 'subscriptionExpired'
      ? 'subscription_expired'
      : 'manage_billing';
// paymentFailed removed — it's no longer a valid status from Stripe mapping
```

**7. Tests — Update encoded behavior**
- `check-entitlement.test.ts:120`: Change `paymentFailed` test to use `subscriptionExpired`, expect `subscription_expired` reason
- `check-entitlement.test.ts`: Add test for `subscriptionExpired` with phantom period → `subscription_expired` (not `payment_processing`)
- `stripe-subscription-status` tests: Verify `incomplete_expired` → `subscriptionExpired` forward mapping
- `pricing/page.test.tsx`: Add test for `subscription_expired` banner
- `checkout-success` tests: Verify `subscriptionExpired` status routes to `subscription_expired` reason

### Rejected Alternative: Option A (Heuristic)

Option A would detect "phantom periods" by comparing `createdAt` to `currentPeriodEnd` distance, routing to `subscription_required` when the subscription never truly started. Rejected because:
- Depends on Stripe's ~23-hour incomplete window — fragile if Stripe changes it
- Leaks Stripe lifecycle timing into domain logic (violates Clean Architecture)
- Requires threading `createdAt` through `getNonEntitledReason` signature
- Doesn't fix the semantic mismatch (`paymentFailed` still means two things)
- Would need duplication in `checkout-success-sync.tsx`

### Why `subscriptionExpired` (not `expired`)

`expired` is too generic — could be confused with trial expiration, period expiration, or cancellation. `subscriptionExpired` is unambiguous: the subscription itself is permanently dead.

## Verification

- [ ] Unit test: `incomplete_expired` webhook → domain status = `subscriptionExpired`
- [ ] Unit test: `subscriptionExpired` with phantom period → reason = `subscription_expired` (not `payment_processing`)
- [ ] Unit test: `incomplete` still → `paymentProcessing` → reason = `payment_processing` (unchanged)
- [ ] Unit test: Pricing banner shows "expired" message for `subscription_expired` reason
- [ ] Unit test: Checkout success routes `subscriptionExpired` to `subscription_expired` reason
- [ ] Integration test: Full webhook → entitlement → redirect → banner flow
- [ ] Regression: All other status mappings unchanged

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
