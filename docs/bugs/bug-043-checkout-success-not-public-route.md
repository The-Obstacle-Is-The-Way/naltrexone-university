# BUG-043: Checkout Success Route Not in Public Routes

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The `/checkout/success` route is NOT listed in the Clerk middleware's public routes. This means users returning from Stripe checkout may face authentication challenges before reaching the success page.

## Location

**File:** `proxy.ts:3-11`

```typescript
const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
  '/api/webhooks/clerk(.*)',
  // MISSING: '/checkout/success(.*)'
]);
```

## Steps to Reproduce

1. Start checkout flow while logged in
2. Complete payment on Stripe
3. Stripe redirects to `/checkout/success?session_id=...`
4. Clerk middleware intercepts the request
5. If session is stale/expired, `auth.protect()` may redirect to sign-in

## Root Cause

When the `/checkout/success` route was created, it was not added to the public routes list. The route requires authentication to verify the user, but it should be accessible so the page can handle its own auth logic (it calls `requireUser()` internally).

## Impact

- **User impact:** Medium — may cause "infinite redirect" or auth failures after payment
- **Timing:** Only affects users whose session becomes stale during Stripe checkout
- **Workaround:** User can sign in again, subscription will be synced via webhook eventually

## Recommended Fix

Add `/checkout/success(.*)` to the public routes in `proxy.ts`:

```typescript
const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/checkout/success(.*)',  // ADD THIS
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
  '/api/webhooks/clerk(.*)',
]);
```

The checkout success page handles its own authentication via `requireUser()` and will redirect appropriately if the user is not authenticated.

## Verification

- [ ] Add route to public routes list
- [ ] Test checkout flow end-to-end
- [ ] Verify user reaches success page after Stripe payment
- [ ] Verify redirect to dashboard after successful sync

## Related

- `proxy.ts` — Clerk middleware configuration
- `app/(marketing)/checkout/success/page.tsx` — Success page (has internal auth check)
- BUG-042: Checkout success silent validation failure
