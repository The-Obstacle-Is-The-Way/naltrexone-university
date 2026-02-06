# BUG-076: Past-Due Subscribers Lose Access Immediately

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

When a subscriber's payment fails (card expired, insufficient funds), Stripe marks the subscription as `past_due`. The app immediately revokes access because `pastDue` is not in the `EntitledStatuses` list.

However, Stripe's default behavior retries the charge multiple times over a configurable grace period (typically 1-7 days). During this window, the subscriber has no way to know their payment failed (no in-app banner), and they're abruptly locked out of content they were using.

### Current Behavior

```
Day 0: Card expires
Day 0: Stripe retries → fails → status = past_due
Day 0: Webhook fires → app sets status to pastDue
Day 0: User opens app → "Subscription required" → locked out immediately
Day 1-7: Stripe retries → user still locked out
Day 7: Stripe gives up → status = canceled
```

### Expected Behavior

```
Day 0: Card expires
Day 0: Stripe retries → fails → status = past_due
Day 0: Webhook fires → app sets status to pastDue
Day 0: User opens app → sees warning banner: "Payment failed. Update your card."
Day 0-7: User retains access while Stripe retries / user updates card
Day 7: If not resolved → status = canceled → access revoked
```

## Root Cause

`EntitledStatuses` in `src/domain/value-objects/subscription-status.ts` only includes `['active', 'inTrial']`. The `pastDue` status is explicitly excluded.

This is a defensible conservative choice, but it's overly aggressive for SaaS products where involuntary churn (failed payments) is a major revenue leak. Industry standard is to provide a grace period.

## Fix

### Option A: Add `pastDue` to EntitledStatuses (Recommended — simplest)

```typescript
// subscription-status.ts
export const EntitledStatuses: readonly SubscriptionStatus[] = [
  'active',
  'inTrial',
  'pastDue',  // ← retain access during Stripe retry window
] as const;
```

Combine with a warning banner on the app layout when status is `pastDue`.

### Option B: Grace period logic

Keep `pastDue` out of `EntitledStatuses` but add a separate grace period check:

```typescript
export function isEntitled(subscription, now) {
  if (!subscription) return false;
  if (isEntitledStatus(subscription.status)) {
    return subscription.currentPeriodEnd > now;
  }
  if (subscription.status === 'pastDue') {
    return subscription.currentPeriodEnd > now;  // grace until period ends
  }
  return false;
}
```

### Option C: Configure in Stripe Dashboard

Set Stripe's "Smart Retries" and "Customer Emails" to auto-notify users of failed payments, and configure the dunning timeline. This doesn't fix the in-app lockout but reduces the blast radius.

**Recommendation:** Option A + Option C together.

## Verification

- [ ] Unit test: `pastDue` subscription with future `currentPeriodEnd` → `isEntitled = true`
- [ ] Unit test: `pastDue` subscription with past `currentPeriodEnd` → `isEntitled = false`
- [ ] Warning banner displayed for `pastDue` users
- [ ] Existing entitlement tests updated
- [ ] Manual test: simulate `past_due` in Stripe test mode

## Related

- `src/domain/value-objects/subscription-status.ts:29-32` (`EntitledStatuses`)
- `src/domain/services/entitlement.ts:7-15`
- BUG-075 (checkout guard mismatch — compounds this if user tries to re-subscribe while past_due)
- BUG-024 (archived — previously documented this race condition, but the fix only added the status check without granting grace)
