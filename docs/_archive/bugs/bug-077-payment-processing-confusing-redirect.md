# BUG-077: Payment Processing Users See Wrong Error Message

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-06

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

Implemented Option A.

- `CheckEntitlementUseCase` now returns redirect reason context for non-entitled states.
- `enforceEntitledAppUser` now uses that reason instead of collapsing everything to `subscription_required`.
- Redirect behavior now matches checkout-success messaging:
  - `paymentProcessing` / `paymentFailed` -> `?reason=payment_processing`
  - active-period non-entitled states (`pastDue`, `canceled`, `unpaid`, `paused`) -> `?reason=manage_billing`
  - no subscription / expired period -> `?reason=subscription_required`

## Verification

- [x] Unit test: `paymentProcessing` or `paymentFailed` redirects with `reason=payment_processing`
- [x] Unit test: active-period non-entitled billing states redirect with `reason=manage_billing`
- [x] Unit test: no-subscription/expired redirects with `reason=subscription_required`
- [x] Pricing page renders appropriate banner/action for each reason
- [x] Existing layout tests pass

## Related

- `app/(app)/app/layout.tsx:30-44` (`enforceEntitledAppUser`)
- `src/application/use-cases/check-entitlement.ts`
- `app/pricing/page.tsx` (banner rendering from URL params)
- BUG-076 (pastDue lockout — would benefit from the same status-aware redirect)
