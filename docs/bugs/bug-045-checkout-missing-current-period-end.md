# BUG-045: Checkout Success Validation Fails — missing_current_period_end

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Summary

After successful Stripe checkout payment, the checkout success page redirects to `/pricing?checkout=error` because `subscription.current_period_end` returns `null`. This is due to a **Stripe API breaking change** in version `2025-03-31`.

## Root Cause (CONFIRMED)

**Stripe API version `2025-03-31` deprecated `current_period_start` and `current_period_end` at the subscription level.** These fields now exist only on **subscription items**.

Our Stripe API version: `2026-01-28.clover` (see Stripe CLI output)

**Source:** https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end

```typescript
// OLD (broken on API >= 2025-03-31)
subscription.current_period_end  // ❌ Returns null

// NEW (correct)
subscription.items.data[0].current_period_end  // ✅ This is where it lives now
```

## Affected Code

1. **Checkout success page:** `app/(marketing)/checkout/success/page.tsx:258`
2. **Webhook handler:** `src/adapters/gateways/stripe-payment-gateway.ts:321`

Both read `subscription.current_period_end` which is now `null`.

## Observed Error

From server logs:
```json
{
  "level": 50,
  "reason": "missing_current_period_end",
  "sessionId": "cs_test_...",
  "currentPeriodEndSeconds": null,
  "msg": "Checkout success validation failed"
}
```

## Fix Required

Update both locations to read from subscription items:

```typescript
// In checkout success page and webhook handler:
const currentPeriodEndSeconds = subscription.items?.data?.[0]?.current_period_end;
```

Also update the type definition in `stripe-payment-gateway.ts:112`:
```typescript
type StripeSubscriptionLike = {
  // ... existing fields
  items?: {
    data?: Array<{
      price?: { id?: string };
      current_period_start?: number;  // ADD
      current_period_end?: number;    // ADD
    }>
  };
};
```

## Current Workaround

Webhooks (after the initial 500) eventually sync the subscription because some webhook events still include period data in previous_attributes. Users can navigate to dashboard manually.

## Impact

- **User experience:** Critical — ALL new subscriptions fail at checkout success
- **Data integrity:** Low — webhook backup eventually syncs
- **Revenue:** None — payments complete successfully

## Related

- Stripe changelog: https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
- BUG-042: Checkout Success Redirects Without Diagnostics (archived)
- `app/(marketing)/checkout/success/page.tsx:258-263`
- `src/adapters/gateways/stripe-payment-gateway.ts:321-325`
