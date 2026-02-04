# BUG-055: Authenticated Subscribers Redirected to Landing Page After Sign-In

**Status:** Open
**Priority:** P2
**Date:** 2026-02-04

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

No post-sign-in redirect is configured anywhere in the codebase:

- **No `afterSignInUrl` or `forceRedirectUrl`** on `<SignIn>` component (`app/sign-in/[[...sign-in]]/page.tsx`)
- **No `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`** environment variable (`.env.example` confirms none)
- **No `afterSignInUrl` on `<ClerkProvider>`** (`components/providers.tsx` passes no props)
- **Clerk default behavior:** redirect to referrer URL, or `/` if none

The middleware (`proxy.ts`) correctly marks `/` as a public route, so authenticated users pass through to the landing page without being redirected to the app.

**Note:** The checkout success page (`/checkout/success`) _does_ correctly redirect to `/app/dashboard` after initial payment via `syncCheckoutSuccess()`. This bug only affects subsequent sign-ins.

## Affected Code

| File | Issue |
|------|-------|
| `app/sign-in/[[...sign-in]]/page.tsx` | `<SignIn>` has no `forceRedirectUrl` prop |
| `app/sign-up/[[...sign-up]]/page.tsx` | `<SignUp>` has no `forceRedirectUrl` prop |
| `components/providers.tsx` | `<ClerkProvider>` has no `afterSignInUrl` prop |
| `.env.example` | No `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` variable |
| `lib/public-routes.ts` | `/` is correctly public (not the cause, but relevant context) |

## Proposed Fix

### Option A: Add `forceRedirectUrl` to Clerk components (Recommended)

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
<SignIn forceRedirectUrl="/app/dashboard" />
```

```tsx
// app/sign-up/[[...sign-up]]/page.tsx
<SignUp forceRedirectUrl="/app/dashboard" />
```

This works because:
- Entitled users go straight to dashboard
- Unentitled users hit `/app/dashboard` layout, which calls `enforceEntitledAppUser()` and redirects to `/pricing?reason=subscription_required`
- Net effect: subscribers go to dashboard, non-subscribers go to pricing

### Option B: Environment variable approach

```env
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app/dashboard
```

Simpler but less explicit — relies on Clerk's env var convention.

### Option C: Smart redirect page

Create `/auth/callback` that checks entitlement and redirects accordingly. More complex, more control. Probably overkill since Option A handles both cases via the existing layout guard.

## Impact

- **User Experience:** Returning subscribers see marketing content instead of their dashboard — feels broken
- **Conversion:** Users may think their subscription isn't working
- **Severity:** Medium — workaround exists (click Dashboard link), but first impression is poor

## Related

- `app/(app)/app/layout.tsx` — `enforceEntitledAppUser()` handles the unentitled redirect
- `app/(marketing)/checkout/success/page.tsx` — Correct redirect behavior (line 369)
- `lib/public-routes.ts` — Public route patterns
- `proxy.ts` — Clerk middleware configuration
