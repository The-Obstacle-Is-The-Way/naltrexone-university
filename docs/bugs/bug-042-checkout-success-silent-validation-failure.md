# BUG-042: Checkout Success Page Fails Silently — No Debug Logging

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Description

After completing Stripe checkout with a valid payment, users are redirected to `/pricing?checkout=error` instead of their dashboard. The checkout success page (`/checkout/success`) has **8 different validation checks** that all redirect to the same error URL without logging which check failed.

This makes debugging impossible without code changes.

**User-Visible Error:**
```
"Checkout failed. Please try again."
```

**Server Logs:**
```
GET /checkout/success?session_id=cs_test_... 307
GET /pricing?checkout=error 200
```

## Steps to Reproduce

1. Go to http://localhost:3000/pricing while logged in
2. Click "Subscribe Monthly"
3. Complete Stripe checkout with test card `4242 4242 4242 4242`
4. Observe redirect to `/pricing?checkout=error` instead of dashboard

## Root Cause

The `syncCheckoutSuccess` function in `app/(marketing)/checkout/success/page.tsx` has 8 validation checks (lines 118-155) that all redirect to the same error route:

```typescript
// Line 118: No session ID
if (!input.sessionId) redirectFn(CHECKOUT_ERROR_ROUTE);

// Line 129: Missing Stripe IDs
if (!stripeCustomerId || !subscriptionId) redirectFn(CHECKOUT_ERROR_ROUTE);

// Line 137-138: User ID mismatch ← LIKELY CULPRIT
if (metadataUserId && metadataUserId !== user.id) redirectFn(CHECKOUT_ERROR_ROUTE);

// Line 141-142: Invalid subscription status
if (!status || !isValidSubscriptionStatus(status)) redirectFn(CHECKOUT_ERROR_ROUTE);

// Line 145-146: Missing period end
if (typeof currentPeriodEndSeconds !== 'number') redirectFn(CHECKOUT_ERROR_ROUTE);

// Line 149: Missing cancel flag
if (typeof cancelAtPeriodEnd !== 'boolean') redirectFn(CHECKOUT_ERROR_ROUTE);

// Line 152: Missing price ID
if (!priceId) redirectFn(CHECKOUT_ERROR_ROUTE);

// Line 155: Unknown plan ← POSSIBLE CULPRIT
if (!plan) redirectFn(CHECKOUT_ERROR_ROUTE);
```

**No logging** is performed before any of these redirects, making it impossible to diagnose which check is failing.

## Likely Causes

Based on investigation:

1. **User ID Mismatch (Line 137-138):** The subscription metadata contains `user_id` from when checkout was created. If the current authenticated user has a different internal ID, this fails silently.

2. **Plan Lookup Failure (Line 155):** If `getSubscriptionPlanFromPriceId()` returns `null` because the price ID in the subscription doesn't match the configured `NEXT_PUBLIC_STRIPE_PRICE_ID_*` environment variables.

3. **Auth Session Issue:** The Clerk middleware shows "infinite redirect loop" warnings in logs. The user may be authenticated at middleware level but fail `requireUser()` differently.

## Additional Context

- `/checkout/success` is NOT listed as a public route in `proxy.ts` (lines 3-11)
- Stripe subscription data appears valid: status=active, price matches, metadata has user_id
- The `requireUser()` call at line 121 would throw (500 error) if it fails, not redirect
- We're seeing a 307 redirect, so one of the explicit redirect calls is being triggered

## Recommended Fix

Add logging before each redirect:

```typescript
if (!stripeCustomerId || !subscriptionId) {
  logger.error('Checkout validation failed: missing Stripe IDs', {
    stripeCustomerId,
    subscriptionId,
    sessionId: input.sessionId
  });
  redirectFn(CHECKOUT_ERROR_ROUTE);
}

if (metadataUserId && metadataUserId !== user.id) {
  logger.error('Checkout validation failed: user ID mismatch', {
    metadataUserId,
    currentUserId: user.id,
    sessionId: input.sessionId
  });
  redirectFn(CHECKOUT_ERROR_ROUTE);
}

// ... etc for each check
```

## Verification

- [ ] Add logging to each validation check
- [ ] Reproduce the error and identify which check fails
- [ ] Fix the root cause
- [ ] Checkout flow completes successfully

## Impact

- **User impact:** Critical — users cannot subscribe, payments are taken but access is denied
- **Business impact:** Critical — revenue-blocking bug
- **Data impact:** None — Stripe has the subscription, just not synced to our DB

## Related

- `app/(marketing)/checkout/success/page.tsx:113-170`
- `proxy.ts` — middleware public routes
- BUG-039: Checkout Success searchParams (resolved)
- BUG-041: Webhook subscription.created missing metadata
