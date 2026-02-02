# BUG-045: Checkout Success Validation Fails — missing_current_period_end

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Summary

After successful Stripe checkout payment, the checkout success page redirects to `/pricing?checkout=error` because the subscription object is missing `current_period_end`. This causes the eager sync to fail validation.

## Observed Error

From server logs:
```json
{
  "level": 50,
  "reason": "missing_current_period_end",
  "sessionId": "cs_test_a1C2mxQawUtoRy1cxV8HalMgFTtQzoFMFKsREfbkkBh5T4CgerXkjs0IAW",
  "currentPeriodEndSeconds": null,
  "msg": "Checkout success validation failed"
}
```

## Steps to Reproduce

1. Go to `/pricing` while logged in
2. Click "Subscribe Annual" or "Subscribe Monthly"
3. Complete Stripe checkout with test card `4242 4242 4242 4242`
4. Observe redirect to `/pricing?checkout=error` instead of dashboard
5. Check server logs for `missing_current_period_end`

## Root Cause (Investigation Needed)

The `syncCheckoutSuccess` function retrieves the subscription via:
```typescript
const subscription = await d.stripe.subscriptions.retrieve(subscriptionId);
const currentPeriodEndSeconds = subscription.current_period_end;
assertNumber(currentPeriodEndSeconds, 'missing_current_period_end', {...});
```

Possible causes:
1. **Timing race**: Subscription not fully provisioned when checkout success page loads
2. **Stripe API version mismatch**: The `2026-01-28.clover` API version may have different response shapes
3. **Expand parameter**: Need to verify if `current_period_end` requires explicit expansion

## Current Workaround

The Stripe webhook (`customer.subscription.created` / `updated`) still processes successfully after the initial 500, so subscriptions ARE eventually synced. Users can:
- Refresh the page
- Navigate to dashboard manually
- Wait ~30 seconds for webhook to complete

## Proposed Investigation

1. Add logging to capture the full subscription object shape
2. Verify Stripe API version compatibility
3. Consider adding retry logic with exponential backoff
4. Check if checkout session expansion includes subscription details

## Impact

- **User experience:** Poor — checkout "fails" visually despite payment succeeding
- **Data integrity:** Low — webhook backup ensures subscription is synced
- **Revenue:** None — payments complete successfully

## Related

- BUG-042: Checkout Success Redirects Without Diagnostics (archived — we added the logging that surfaced this)
- DEBT-069: Document Stripe Eager Sync Pattern (archived)
- `app/(marketing)/checkout/success/page.tsx:258-263`
