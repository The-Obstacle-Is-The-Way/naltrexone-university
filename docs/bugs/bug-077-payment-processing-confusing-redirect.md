# BUG-077: Payment Processing Users See Wrong Error Message

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

When a user completes Stripe checkout but their payment is still processing (e.g., 3D Secure authentication pending, bank transfer), the subscription status is `incomplete` (mapped to `paymentProcessing` in domain). The checkout success page correctly handles this by redirecting to `/pricing?reason=payment_processing`.

However, if the user navigates directly to any `/app/*` route (via bookmark, back button, or typing the URL), the layout's `enforceEntitledAppUser` check redirects them to `/pricing?reason=subscription_required` — the generic "you need a subscription" message. The user just paid and now sees a message implying they don't have a subscription at all.

### Current Behavior

```
1. User completes checkout (payment processing — e.g., 3D Secure)
2. Redirected to /pricing?reason=payment_processing ← correct
3. User bookmarks /app/dashboard and navigates there later
4. enforceEntitledAppUser → isEntitled = false (paymentProcessing not entitled)
5. Redirects to /pricing?reason=subscription_required ← WRONG
6. User sees: "Subscription required to access the app"
7. User panics: "I just paid! Where's my subscription?!"
```

### Expected Behavior

```
5. Redirects to /pricing?reason=payment_processing ← should check status
6. User sees: "Your payment is being processed. You'll have access shortly."
```

## Root Cause

The `enforceEntitledAppUser` function in `app/(app)/app/layout.tsx` only knows `isEntitled: boolean`. It does not distinguish between "no subscription exists" and "subscription exists but in a non-entitled status." All non-entitled states produce the same generic redirect.

## Fix

### Option A: Return subscription status alongside entitlement (Recommended)

Extend the entitlement check to return the subscription status:

```typescript
// check-entitlement.ts output
{
  isEntitled: boolean;
  reason?: 'no_subscription' | 'payment_processing' | 'past_due' | 'canceled' | 'expired';
}
```

Then in the app layout:

```typescript
if (!entitlement.isEntitled) {
  if (entitlement.reason === 'payment_processing') {
    redirect('/pricing?reason=payment_processing');
  } else if (entitlement.reason === 'past_due') {
    redirect('/pricing?reason=payment_failed');
  } else {
    redirect('/pricing?reason=subscription_required');
  }
}
```

### Option B: Check subscription directly in layout

Query the subscription status in the layout and use it for the redirect reason. Less clean architecturally but simpler to implement.

## Verification

- [ ] Unit test: `paymentProcessing` user redirected with `reason=payment_processing`
- [ ] Unit test: `pastDue` user redirected with `reason=payment_failed`
- [ ] Unit test: no-subscription user redirected with `reason=subscription_required`
- [ ] Pricing page renders appropriate message for each reason
- [ ] Existing layout tests still pass

## Related

- `app/(app)/app/layout.tsx:30-44` (`enforceEntitledAppUser`)
- `src/application/use-cases/check-entitlement.ts`
- `app/pricing/page.tsx` (banner rendering from URL params)
- BUG-076 (pastDue lockout — would benefit from the same status-aware redirect)
