# BUG-043: Checkout Success Route Not Public (Stripe Return)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The Stripe return URL (`/checkout/success?session_id=...`) was treated as a protected route by the Clerk middleware. If a user's session expires while they are on Stripe, the middleware can redirect to sign-in before the success page runs, risking loss of the `session_id` query param and preventing eager subscription sync.

## Root Cause

1. `proxy.ts` did not include `/checkout/success(.*)` in its public-route matcher, so `auth.protect()` always executed on this route.
2. The checkout success page assumed an authenticated session and had no explicit redirect-to-sign-in path that preserved `session_id`.

## Fix

1. Added `/checkout/success(.*)` to `lib/public-routes.ts` so the middleware does not auto-protect the Stripe return route.
2. Updated `app/(marketing)/checkout/success/page.tsx` to call `redirectToSignIn({ returnBackUrl })` when unauthenticated, preserving the `session_id` in the return URL.

## Verification

- [x] Unit test added: `lib/public-routes.test.ts`
- [x] Unit test added: `app/(marketing)/checkout/success/page.test.ts`
- [ ] Manual: expire session during checkout, confirm sign-in returns to `/checkout/success?session_id=...` and redirects to dashboard

## Related

- `lib/public-routes.ts` — Public route patterns
- `proxy.ts` — Clerk middleware configuration
- `app/(marketing)/checkout/success/page.tsx` — Success page (eager sync + sign-in redirect)
- BUG-042: Checkout success silent validation failure
