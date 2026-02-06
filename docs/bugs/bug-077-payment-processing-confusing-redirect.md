# BUG-077: Payment Processing Users See Wrong Error Message

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

When a user completes Stripe checkout but their payment is still processing (e.g., 3D Secure pending), Stripe status `incomplete` maps to domain status `paymentProcessing`. The checkout success page correctly redirects to `/pricing?reason=payment_processing`.

However, if the user navigates directly to any `/app/*` route (via bookmark, back button, or typing the URL), the layout's `enforceEntitledAppUser` check redirects them to `/pricing?reason=subscription_required` — the generic "you need a subscription" message. The user just paid and now sees a message implying they don't have a subscription at all.

### Current Behavior

```
1. User completes checkout (payment processing — e.g., 3D Secure)
2. Redirected to /pricing?reason=payment_processing ← correct
3. User bookmarks /app/dashboard and navigates there later
4. enforceEntitledAppUser → isEntitled = false (paymentProcessing not entitled)
5. Redirects to /pricing?reason=subscription_required
6. User sees: "Subscription required to access the app"
7. Message is inconsistent with checkout-success messaging
```

### Expected Behavior

```
5. Redirects to /pricing?reason=payment_processing
6. User sees: "Your payment is being processed. You'll have access shortly."
```

## Root Cause

`enforceEntitledAppUser` in `app/(app)/app/layout.tsx` receives only `isEntitled: boolean` from `CheckEntitlementUseCase`. It cannot distinguish:
- no subscription
- `paymentProcessing` / `paymentFailed`
- `pastDue` / `canceled` / `unpaid` / `paused`

All non-entitled states collapse to the same redirect reason.

## Fix

### Option A: Return status context with entitlement (Recommended)

Extend the entitlement check to return the subscription status:

```typescript
// check-entitlement.ts output
{
  isEntitled: boolean;
  reason:
    | 'no_subscription'
    | 'payment_processing'
    | 'manage_billing'
    | 'subscription_required';
}
```

Then in the app layout:

```typescript
if (!entitlement.isEntitled) {
  if (entitlement.reason === 'payment_processing') {
    redirect('/pricing?reason=payment_processing');
  } else if (entitlement.reason === 'manage_billing') {
    redirect('/pricing?reason=manage_billing');
  } else {
    redirect('/pricing?reason=subscription_required');
  }
}
```

### Option B: Check subscription directly in layout

Query the subscription status in the layout and use it for the redirect reason. Less clean architecturally but simpler to implement.

## Verification

- [ ] Unit test: `paymentProcessing` or `paymentFailed` redirects with `reason=payment_processing`
- [ ] Unit test: `pastDue`/`canceled`/`unpaid`/`paused` redirects with `reason=manage_billing`
- [ ] Unit test: no-subscription redirects with `reason=subscription_required`
- [ ] Pricing page renders appropriate message for each reason
- [ ] Existing layout tests still pass

## Related

- `app/(app)/app/layout.tsx:30-44` (`enforceEntitledAppUser`)
- `src/application/use-cases/check-entitlement.ts`
- `app/pricing/page.tsx` (banner rendering from URL params)
- BUG-076 (pastDue lockout — would benefit from the same status-aware redirect)
