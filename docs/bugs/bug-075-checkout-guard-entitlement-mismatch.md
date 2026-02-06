# BUG-075: Checkout Guard / Entitlement Check Mismatch

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

The entitlement check (`isEntitled`) and the checkout guard (`CreateCheckoutSessionUseCase`) use different criteria to decide whether a user has an active subscription. This creates a dead zone where a user sees "View Pricing" but cannot actually subscribe.

### Entitlement Check (gates app access)

```typescript
// src/domain/services/entitlement.ts:7-15
export function isEntitled(subscription, now) {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;  // ← checks status
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}
```

Entitled statuses: `active`, `inTrial` only.

### Checkout Guard (gates new subscription)

```typescript
// src/application/use-cases/create-checkout-session.ts:57
if (subscription && subscription.currentPeriodEnd > this.now()) {
  throw new ApplicationError('ALREADY_SUBSCRIBED', ...);
}
```

This only checks `currentPeriodEnd > now` — it does **not** check the subscription status.

### The Dead Zone

If a subscription has:
- Status: `canceled` (or `pastDue`, `unpaid`, `paymentProcessing`, `paymentFailed`)
- `currentPeriodEnd`: still in the future

Then:
- `isEntitled` → **false** (bad status) → User sees "View Pricing"
- `createCheckoutSession` → **throws ALREADY_SUBSCRIBED** (period still future) → Error page

The user is locked out of the app AND cannot re-subscribe.

## Steps to Reproduce

1. Subscribe to the app (monthly plan)
2. Cancel the subscription via Stripe billing portal
3. Stripe sets `cancel_at_period_end: true` — subscription remains `active` until period end
4. When the period ends, status changes to `canceled` — but some edge cases (immediate cancellation, Stripe proration) may set `canceled` while `currentPeriodEnd` is still future
5. Navigate to `/pricing` → sees pricing cards (not entitled)
6. Click "Subscribe Monthly" → gets "Already subscribed" error

Most common real-world trigger: user has a `pastDue` subscription where the `currentPeriodEnd` hasn't passed yet.

## Root Cause

The checkout guard was written to prevent double-subscribing but only checks the period end date. It should also check whether the subscription status actually grants entitlement. If the subscription is not entitled, the user should be allowed to start a new checkout.

## Fix

Update the checkout guard to align with the entitlement check:

```typescript
// create-checkout-session.ts:56-62
const subscription = await this.subscriptions.findByUserId(input.userId);
if (
  subscription &&
  isEntitledStatus(subscription.status) &&  // ← ADD THIS
  subscription.currentPeriodEnd > this.now()
) {
  throw new ApplicationError('ALREADY_SUBSCRIBED', ...);
}
```

Alternatively, for `canceled` with `cancelAtPeriodEnd: true` (still active until period end), direct the user to the billing portal to reactivate instead of creating a new subscription.

## Verification

- [ ] Unit test: user with `canceled` status + future `currentPeriodEnd` can create checkout
- [ ] Unit test: user with `pastDue` status + future `currentPeriodEnd` can create checkout
- [ ] Unit test: user with `active` status + future `currentPeriodEnd` still blocked (correct behavior)
- [ ] Existing entitlement tests still pass
- [ ] Manual test: cancel subscription, then re-subscribe

## Related

- `src/application/use-cases/create-checkout-session.ts:53-62`
- `src/domain/services/entitlement.ts:7-15`
- `src/domain/value-objects/subscription-status.ts` (`EntitledStatuses`)
- BUG-052 (archived — previously fixed a similar guard issue)
- BUG-076 (pastDue immediate lockout — compounds this issue)
