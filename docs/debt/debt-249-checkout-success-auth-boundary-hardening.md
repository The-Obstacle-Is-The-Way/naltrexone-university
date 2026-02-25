# DEBT-249: Checkout Success Auth Boundary Hardening (Stripe Return + Clerk Redirect)

**Status:** Active  
**Priority:** P1  
**Date:** 2026-02-25  
**Owner:** Billing/Auth  
**Related:** [BS-032](../brainstorming/bs-032-stripe-checkout-clerk-session-friction.md), BUG-043, ADR-014

---

## Description

`/checkout/success` is currently configured as a public route and performs a manual auth fallback inside the page (`auth() -> redirectToSignIn(returnBackUrl)`).

This preserves `session_id` today, but it can produce a visible auth bounce after hosted Stripe redirect (pay -> sign-in -> return -> dashboard), which is poor conversion UX in a payment-critical path.

The debt is to harden this flow so it is both:

1. **User-robust**: fewer post-payment auth bounces.
2. **Failure-robust**: no regression where `session_id` is lost during sign-in redirect.

## Why this is debt (not a one-line fix)

We have historical evidence (BUG-043) that route-protection changes here can regress query-param preservation.  
Changing `PUBLIC_ROUTE_PATTERNS` alone is not sufficient; redirect semantics and test coverage must be updated together.

## Required change set

1. Remove `/checkout/success(.*)` from `PUBLIC_ROUTE_PATTERNS`.
2. In `proxy.ts`, protect `/checkout/success` with `auth.protect()` and lock redirect behavior with tests:
   - Current Clerk SDK behavior sets sign-in `redirect_url` to the current request URL by default.
   - This behavior exists in both `@clerk/nextjs@6.37.1` and `@clerk/nextjs@6.38.1`; do not assume BUG-043 was fixed by a recent SDK default change.
   - Keep callback logic minimal; do not rely on callback-only branching for handshake cases.
3. Explicitly cover handshake preemption:
   - Clerk may return a handshake redirect before middleware callback code executes.
   - Add regression tests for `/checkout/success?session_id=...` that validate query preservation across handshake redirects.
4. Keep page-level fallback redirect in `checkout-success-sync.tsx` permanently as defense-in-depth.
5. Add/adjust tests:
   - `lib/public-routes.test.ts` reflects protected route.
   - `proxy.test.ts` covers preserved `session_id` query in redirect behavior.
   - existing checkout success tests continue to pass.
6. Add rollout instrumentation:
   - auth bounce count on `/checkout/success`
   - `%` of checkout-success requests missing `session_id`
   - checkout error redirect rate (`/pricing?checkout=error`)

## Acceptance criteria

- [ ] `/checkout/success` is no longer public in middleware matcher config.
- [ ] Unauthenticated hit to `/checkout/success?session_id=cs_xxx` redirects to sign-in and returns with the same `session_id`.
- [ ] Clerk handshake redirect on `/checkout/success?session_id=cs_xxx` preserves `session_id`.
- [ ] Authenticated Stripe return reaches eager sync and redirects correctly.
- [ ] Webhook-first and page-first races remain idempotent (no regressions from BUG-099 fix).
- [ ] `pnpm test --run app/(marketing)/checkout/success/page.test.ts lib/public-routes.test.ts proxy.test.ts` passes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `session_id` dropped during sign-in redirect | Validate Clerk default `auth.protect()` redirect behavior with regression tests; explicit override only if needed |
| Handshake redirect bypasses middleware callback branch | Add handshake-specific test case; do not assume callback ordering |
| Clerk force-redirect config overrides `redirect_url` | Keep force redirect env vars unset for sign-in in this flow; verify in env audit |
| Production behavior differs from preview/dev | Validate on production domain with test user flow before full rollout |
| False negative if success page fails but webhook succeeds | Keep webhook as source of truth; monitor checkout error redirect rate |

## External evidence used

- Clerk middleware route-protection pattern: https://clerk.com/docs/reference/nextjs/clerk-middleware
- Clerk `auth.protect()` semantics: https://clerk.com/docs/reference/nextjs/app-router/auth
- Clerk redirect URL behavior (`redirect_url`, force/fallback redirects): https://clerk.com/docs/guides/development/customize-redirect-urls
- Clerk middleware example with `returnBackUrl: req.url`: https://clerk.com/docs/guides/development/add-onboarding-flow
- Clerk cookie settings (`SameSite=Lax`) and session token behavior: https://clerk.com/docs/guides/how-clerk-works/cookies
- Clerk middleware source (redirect before user callback on location header): https://github.com/clerk/javascript/blob/main/packages/nextjs/src/server/clerkMiddleware.ts
- Clerk `auth()` source (default returnBackUrl to current request URL): https://github.com/clerk/javascript/blob/main/packages/nextjs/src/app-router/server/auth.ts
- Clerk `auth()` at `@clerk/nextjs@6.37.1` (BUG-043-era baseline): https://github.com/clerk/javascript/blob/@clerk/nextjs@6.37.1/packages/nextjs/src/app-router/server/auth.ts
- Clerk `auth()` at `@clerk/nextjs@6.38.1`: https://github.com/clerk/javascript/blob/@clerk/nextjs@6.38.1/packages/nextjs/src/app-router/server/auth.ts
- Clerk protect source (`auth.protect()` unauthenticated path): https://github.com/clerk/javascript/blob/main/packages/nextjs/src/server/protect.ts
- Clerk middleware `nextErrors` at `@clerk/nextjs@6.37.1` (`returnBackUrl || url`): https://github.com/clerk/javascript/blob/@clerk/nextjs@6.37.1/packages/nextjs/src/server/nextErrors.ts
- Clerk handshake source (`redirect_url` uses full current URL): https://github.com/clerk/javascript/blob/main/packages/backend/src/tokens/handshake.ts
- Clerk handshake tests (query preservation and cleanup): https://github.com/clerk/javascript/blob/main/packages/backend/src/tokens/__tests__/handshake.test.ts
- Clerk cross-origin handshake tests (cross-site document requests): https://github.com/clerk/javascript/blob/main/packages/backend/src/tokens/__tests__/request.test.ts
- Stripe: webhooks required for fulfillment: https://docs.stripe.com/payments/checkout/custom-success-page?payment-ui=embedded-form
- Next.js cross-site first-load cookie discussion: https://github.com/vercel/next.js/discussions/17612
