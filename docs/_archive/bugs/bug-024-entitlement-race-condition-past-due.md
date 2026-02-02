# BUG-024: Entitlement Race Condition During Payment Failure

**Status:** Won't Fix
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Decision:** 2026-02-02

---

## Summary

When a Stripe subscription transitions to `past_due` status (payment failure on renewal), there is a race condition window where `isEntitled()` may still return `true` because the database hasn't been updated yet via webhook.

**Note:** New checkouts are NOT affected - the codebase already implements eager sync on the checkout success page (`app/(marketing)/checkout/success/page.tsx:92-151`), which fetches subscription data directly from Stripe API before redirecting. This bug only affects **existing subscription renewals and payment failures**.

## Location

- `src/domain/services/entitlement.ts:7-15`
- `src/domain/value-objects/subscription-status.ts:27-29`

## Current Behavior

```typescript
// entitlement.ts
export function isEntitled(
  subscription: Subscription | null,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;  // Only checks 'active'/'trialing'
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}
```

The `EntitledStatuses` array only includes `['active', 'trialing']`. When payment fails:
1. Stripe immediately marks subscription as `past_due`
2. Stripe sends webhook to update database
3. **Race window:** Between steps 1 and 2, database still shows `active`
4. During this window, `isEntitled()` returns `true` for a user with failed payment

## What's Already Correct

**Eager Sync for New Checkouts:** The checkout success page implements Theo Browne's recommended pattern:

```typescript
// app/(marketing)/checkout/success/page.tsx:92-151
export async function syncCheckoutSuccess(input, deps?, redirectFn) {
  const session = await d.stripe.checkout.sessions.retrieve(input.sessionId);
  // ... fetch subscription data directly from Stripe API
  await d.transaction(async ({ stripeCustomers, subscriptions }) => {
    await subscriptions.upsert({ ... });  // Sync BEFORE redirect
  });
  redirectFn('/app/dashboard');
}
```

This prevents users from seeing "no subscription" after checkout.

## What's Still Affected

Only these scenarios have the race condition:
1. **Payment failures on renewal** - User has active subscription, payment fails
2. **Admin actions** - Stripe dashboard changes to subscription
3. **Plan changes** - User upgrades/downgrades via portal

## Impact (Revised)

- **Low revenue leakage:** Window is typically seconds to minutes
- **Acceptable for SaaS:** Industry standard approach per Theo Browne
- **Grace period exists anyway:** Stripe gives users time to fix payment

## Severity Downgrade Rationale

Changed from P1 to P2 because:
1. New checkouts (most common path) already have eager sync
2. Payment failures are rare and Stripe has built-in retry
3. This is the standard webhook-based approach used by most SaaS

## Recommended Fix

We are explicitly accepting this behavior (won't fix):

- The system is intentionally webhook-driven for subscription state, which is eventually consistent by design.
- The window is typically seconds to minutes and Stripe already has a built-in grace/retry period.
- Adding real-time Stripe checks on every entitled action would add latency, cost, and rate-limit risk.

If we later introduce high-risk operations where this matters (e.g. expensive AI grading, protected exports, etc.), we can add a targeted “real-time entitlement” path that queries Stripe for those operations only.

## Related

- BUG-014: Fragile webhook error matching
- DEBT-069: Document Stripe eager sync pattern
- AUDIT-003: External integrations review
- SPEC-009: Stripe Integration
- [Stripe recommendations](https://github.com/t3dotgg/stripe-recommendations)
