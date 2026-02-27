# DEBT-249: Checkout Success Auth Boundary Hardening (Stripe Return + Clerk Redirect)

**Status:** Active  
**Priority:** P1  
**Date:** 2026-02-27  
**Owner:** Billing/Auth  
**Related:** [BS-032](../_archive/brainstorming/bs-032-stripe-checkout-clerk-session-friction.md), BUG-043, ADR-014

---

## Description

The route-protection hardening from BS-032 is now implemented in code:

1. `/checkout/success` is no longer public (`lib/public-routes.ts`).
2. `proxy.ts` protects non-public routes with `auth.protect()`, including `/checkout/success`.
3. Query preservation across both sign-in redirect and handshake redirect is covered by `proxy.test.ts`.
4. Page-level `redirectToSignIn({ returnBackUrl })` fallback remains in `checkout-success-sync.tsx`.

Remaining debt is rollout/operability hardening:

1. **Observability**: emit dedicated instrumentation for checkout-success auth bounces and failure funnels.
2. **Production validation**: explicitly run and record production-domain validation steps.

## Why this is debt (not a one-line fix)

We have historical evidence (BUG-043) that route-protection changes here can regress query-param preservation.  
Changing `PUBLIC_ROUTE_PATTERNS` alone is not sufficient; redirect semantics and test coverage must be updated together.

## Required change set

### Completed in codebase

- [x] Remove `/checkout/success(.*)` from `PUBLIC_ROUTE_PATTERNS`.
- [x] Protect `/checkout/success` via middleware `auth.protect()` path.
- [x] Cover sign-in redirect query preservation for `/checkout/success?session_id=...`.
- [x] Cover Clerk handshake preemption/query preservation for `/checkout/success?session_id=...`.
- [x] Keep page-level fallback redirect in `checkout-success-sync.tsx` as defense-in-depth.
- [x] Keep checkout-success sync idempotent for webhook-first/page-first race paths.

### Outstanding

- [x] Add rollout instrumentation (tracked in [SPEC-016](../specs/spec-016-observability.md)):
  - auth bounce count on `/checkout/success`
  - `%` of checkout-success requests missing `session_id`
  - checkout error redirect rate (`/pricing?checkout=error`)
- [x] Document middleware logging boundary:
  - `proxy.ts` runs in middleware/edge context and does not use container-injected app logger.
  - auth-bounce instrumentation is emitted as structured middleware `console.info({...})` events.
- [ ] Execute production-domain validation checklist and capture outcomes in this debt doc.

## Acceptance criteria

- [x] `/checkout/success` is no longer public in middleware matcher config.
- [x] Unauthenticated hit to `/checkout/success?session_id=cs_xxx` redirects to sign-in and returns with the same `session_id`.
- [x] Clerk handshake redirect on `/checkout/success?session_id=cs_xxx` preserves `session_id`.
- [x] Authenticated Stripe return reaches eager sync and redirects correctly.
- [x] Webhook-first and page-first races remain idempotent (no regressions from BUG-099 fix).
- [x] `pnpm test --run app/(marketing)/checkout/success/page.test.ts lib/public-routes.test.ts proxy.test.ts` passes.
- [x] Rollout instrumentation emits actionable events for:
  - auth bounce count on `/checkout/success`
  - missing `session_id` rate on checkout success requests
  - checkout error redirect rate (`/pricing?checkout=error`)
- [ ] Production validation completed and recorded:
  - Stripe checkout return on production domain with active session
  - Stripe checkout return on production domain with forced sign-out
  - Verify `session_id` survives sign-in round-trip
  - Verify no elevated `/pricing?checkout=error` rate after deployment

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
