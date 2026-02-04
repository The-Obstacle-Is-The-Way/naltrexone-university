# BUG-055: Authenticated Subscribers Redirected to Landing Page After Sign-In

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-04
**Archived:** 2026-02-04

---

## Description

After completing Clerk sign-in (email or OAuth), returning subscribers are redirected to `/` (the marketing landing page) instead of `/app/dashboard`. The user sees a SaaS landing page with "Get Started" messaging when they should be inside the app.

The landing page _is_ auth-aware: the nav shows "Dashboard" and the CTA shows "Go to Dashboard" for entitled users. But requiring an extra click to reach the dashboard creates friction and confusion — users think "did my login work?" or "where's my stuff?"

## Steps to Reproduce

1. Be an existing subscriber with an active subscription
2. Navigate to the app (e.g., `https://addictionboards.com`)
3. Click "Sign In" in the nav
4. Complete Clerk sign-in (Google OAuth or email)
5. **Observe:** You land on `/` (marketing landing page) instead of `/app/dashboard`
6. You must manually click "Dashboard" in the nav or "Go to Dashboard" CTA to reach the app

## Root Cause

No post-sign-in fallback redirect was configured in the codebase:

- **No redirect defaults on `<ClerkProvider>`** (`components/providers.tsx` did not set `signInFallbackRedirectUrl` / `signUpFallbackRedirectUrl`)
- **No relevant env vars set** (`.env.example` does not include Clerk redirect env vars)
- **Clerk behavior:** when no return-back URL is present, post-auth navigation falls back to `/`

The middleware (`proxy.ts`) correctly marks `/` as a public route, so authenticated users pass through to the landing page without being redirected to the app.

**Note:** The checkout success page (`/checkout/success`) _does_ correctly redirect to `/app/dashboard` after initial payment via `syncCheckoutSuccess()`. This bug only affects subsequent sign-ins.

## Fix

Set Clerk redirect defaults globally:

- `components/providers.tsx`: Pass `signInFallbackRedirectUrl="/app/dashboard"` and `signUpFallbackRedirectUrl="/app/dashboard"` to `<ClerkProvider>`.
- Use fallback (not force) so protected-route flows can still return the user to the originally requested URL when a return-back URL is present.

## Impact

- **User Experience:** Returning subscribers see marketing content instead of their dashboard — feels broken
- **Conversion:** Users may think their subscription isn't working
- **Severity:** Medium — workaround exists (click Dashboard link), but first impression is poor

## Related

- `app/(app)/app/layout.tsx` — `enforceEntitledAppUser()` handles the unentitled redirect
- `app/(marketing)/checkout/success/page.tsx` — Correct post-checkout redirect behavior
- `lib/public-routes.ts` — Public route patterns
- `proxy.ts` — Clerk middleware configuration

## Verification

- Unit: `components/providers.test.tsx` asserts redirect defaults are passed to `<ClerkProvider>`.
- Manual: Sign in from `/sign-in` lands on `/app/dashboard`. Unentitled users are redirected to `/pricing?reason=subscription_required` by `enforceEntitledAppUser()` in `app/(app)/app/layout.tsx`.
