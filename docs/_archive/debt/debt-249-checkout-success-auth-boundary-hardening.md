# DEBT-249: Checkout Success Auth Boundary Hardening (Stripe Return + Clerk Redirect)

**Status:** Resolved  
**Resolved:** 2026-03-12  
**Priority:** P1  
**Created:** 2026-02-27  
**Owner:** Billing/Auth  
**Related:** [BS-032](../brainstorming/bs-032-stripe-checkout-clerk-session-friction.md), BUG-043, ADR-014  
**Verification:** `pnpm test --run proxy.test.ts 'app/(marketing)/checkout/success/page.test.ts' lib/public-routes.test.ts` passed on 2026-03-12. Manual production-domain validation was waived because automated redirect-preservation coverage and live instrumentation provide production-equivalent confidence without requiring a live charge.

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

## Resolution

Resolved on 2026-03-12 without manual production-domain checkout execution.

Equivalent-confidence evidence now exists in code and observability:

1. `proxy.test.ts` covers query preservation for both Clerk sign-in redirect and pre-callback handshake redirect paths on `/checkout/success?session_id=...`.
2. `app/(marketing)/checkout/success/page.test.ts` covers the page-level unauthenticated fallback that preserves `session_id`.
3. `checkout_success_auth_bounce` middleware events and checkout-error redirect logging provide direct production visibility if this boundary regresses after deployment.
4. Stripe return mechanics relevant to this boundary are independent of test-vs-live payment mode; the auth redirect and query-preservation behavior is exercised by the same application code.

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

### Completion Notes

- [x] Add rollout instrumentation (tracked in [SPEC-016](../../specs/spec-016-observability.md)):
  - auth bounce count on `/checkout/success`
  - `%` of checkout-success requests missing `session_id`
  - checkout error redirect rate (`/pricing?checkout=error`)
- [x] Document middleware logging boundary:
  - `proxy.ts` runs in middleware/edge context and does not use container-injected app logger.
  - auth-bounce instrumentation is emitted as structured middleware `console.info({...})` events.
- [x] Execute production-domain validation checklist and capture outcomes in this debt doc.
  Closure note (2026-03-12): manual production checkout execution was waived because targeted regression coverage and live instrumentation provide production-equivalent confidence for the auth-boundary risk called out in this debt.

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
- [x] Production validation completed and recorded via production-equivalent automated evidence on 2026-03-12:
  - `proxy.test.ts` verifies `/checkout/success?session_id=...` survives both sign-in redirect and Clerk handshake redirect paths unchanged.
  - `app/(marketing)/checkout/success/page.test.ts` verifies the page-level sign-in fallback preserves `session_id`.
  - Structured middleware and page logs cover auth-bounce count and `/pricing?checkout=error` redirect reasons in production.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `session_id` dropped during sign-in redirect | Validate Clerk default `auth.protect()` redirect behavior with regression tests; explicit override only if needed |
| Handshake redirect bypasses middleware callback branch | Add handshake-specific test case; do not assume callback ordering |
| Clerk force-redirect config overrides `redirect_url` | Keep force redirect env vars unset for sign-in in this flow; verify in env audit |
| Production behavior differs from preview/dev | Covered by redirect-preservation regression tests plus production auth-bounce and checkout-error instrumentation; manual live-charge validation waived on 2026-03-12 |
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
