# BS-032: Stripe Checkout → Clerk Session Friction — Post-Payment Auth Bounce

**Date:** 2026-02-25
**Triggered by:** Manual testing of new-user signup flow on Vercel Preview (`dev` branch)
**Scope:** After Apple OAuth signup → Stripe checkout → payment, user is redirected to Clerk sign-in instead of dashboard
**Related:** ADR-004 (Authentication Boundary), ADR-014 (Stripe Eager Sync), `checkout-success-sync.tsx`, `proxy.ts`

---

## The Problem

A new user experienced the following flow on the Preview deployment:

```
1. Apple OAuth signup (new user) → Clerk session created
2. Navigate to pricing → Start Stripe checkout
3. Pay with test card (4242...) → Stripe redirects to /checkout/success
4. ❌ Clerk auth().userId is null → Redirected to Clerk sign-in
5. Sign in again → Clerk redirects back to /checkout/success (via returnBackUrl)
6. ✅ Auth succeeds → Eager sync runs → Redirected to dashboard
```

The user saw a "kicked out then back in" experience — forced to re-authenticate after paying. No data was lost (the `returnBackUrl` preserved the `session_id`), but the UX friction is significant: a paying customer who just gave you money should never see a sign-in screen.

---

## Root Cause Analysis

### The code path (`checkout-success-sync.tsx:114-118`)

```typescript
const clerkAuth = await d.getClerkAuth();       // auth() from @clerk/nextjs/server
if (!clerkAuth.userId) {
  const returnBackUrl = new URL(ROUTES.CHECKOUT_SUCCESS, d.appUrl);
  returnBackUrl.searchParams.set('session_id', sessionId);
  return clerkAuth.redirectToSignIn({ returnBackUrl });  // ← User saw this
}
const user = await d.authGateway.requireUser();  // Line 121 — second auth check
```

### Why `auth().userId` was null

The `/checkout/success` route is explicitly **public** (`lib/public-routes.ts:6`), so `clerkMiddleware` runs but does NOT call `auth.protect()`. The middleware still validates/refreshes JWT tokens for public routes, but the session may not survive the redirect chain.

**The redirect chain that caused the issue:**

```
Apple OAuth (apple.com) → Clerk callback (clerk.accounts.dev) → App → Stripe checkout (checkout.stripe.com) → App (/checkout/success)
```

That's **4 cross-origin navigations** before landing on `/checkout/success`. Possible causes for session loss:

| Hypothesis | Likelihood | Evidence |
|---|---|---|
| **Safari ITP (Intelligent Tracking Prevention)** | Medium-High | Safari classifies cross-origin redirect chains as tracking behavior and may strip cookies. The Apple OAuth → Clerk → app → Stripe → app chain is exactly the pattern ITP targets. |
| **Clerk JWT expiration during checkout** | Medium | Clerk JWTs have a short lifetime (~60s). If the user spent >60s on Stripe checkout, the JWT would expire. Middleware should refresh it, but there may be a race between middleware processing and `auth()` reading the token on public routes. |
| **New session not fully propagated** | Low-Medium | The Clerk session was literally just created via Apple OAuth. There may be an eventual-consistency window where the session is valid in Clerk's backend but the JWT token hasn't been fully issued/propagated to the app's cookies. |
| **Cookie SameSite restrictions** | Low | Clerk sets cookies with `SameSite=Lax` by default, which should survive top-level navigations (like Stripe redirects). But browser-specific behavior varies. |

### What we verified is NOT the cause

- `NEXT_PUBLIC_APP_URL` is correctly set for all Vercel environments (Preview → dev Vercel URL, Production → addictionboards.com)
- Clerk test keys (`sk_test_`, `pk_test_`) are correctly configured for Preview; live keys for Production
- `ClerkProvider`'s `ssr: false` does NOT affect server-side `auth()` calls
- The `clerkMiddleware` does process public routes (it just doesn't call `auth.protect()`)
- No custom `afterAuth`/`beforeAuth` handlers or session configuration exist

---

## Severity Assessment

| Factor | Assessment |
|---|---|
| **User impact** | High — paying customer forced to re-authenticate immediately after payment |
| **Data integrity** | None — `returnBackUrl` preserves `session_id`, eager sync completes on retry |
| **Frequency** | Unknown — observed once during manual testing. May be browser/timing dependent |
| **Affected flows** | New user signup via OAuth → immediate Stripe checkout (the most critical conversion flow) |
| **Current mitigation** | Code handles it gracefully — redirect to sign-in with returnBackUrl. Functional but jarring |

---

## Industry Standard Analysis

### How do SaaS apps typically handle post-checkout auth?

**Pattern A: Protected checkout success page (most common)**
- The success page is behind auth middleware
- If the session expired, middleware forces re-auth BEFORE the page loads
- Clerk's `auth.protect()` handles token refresh and redirect automatically
- **Trade-off:** Unauthenticated users who bookmark or share the URL get a 401 or redirect, but that's acceptable since the page is useless without auth context anyway

**Pattern B: Client-side polling with loading state**
- Success page is public but shows a "Verifying your payment..." spinner
- Client-side JS polls for auth status and subscription state
- If auth fails, shows a gentle "Please sign in to access your subscription" message
- **Trade-off:** More complex, requires client-side auth handling

**Pattern C: Stripe Checkout with embedded mode**
- Instead of redirecting to Stripe's hosted checkout, embed the checkout form in the app
- User never leaves the app domain, so session cookies are never at risk
- **Trade-off:** More complex integration, less Stripe-managed UX

**Pattern D: Webhook-first with magic link**
- Don't rely on the success redirect at all
- Webhook processes the payment, then sends a "Welcome" email with a magic link
- **Trade-off:** Worse UX (user has to check email), but zero auth race conditions

### What Clerk recommends

Clerk's documentation for Stripe integration recommends making the checkout success page a **protected route** and letting the middleware handle session validation. The `redirectToSignIn` fallback in the page component is a defensive pattern, not the recommended primary path.

---

## Proposed Approaches

### Option 1: Make `/checkout/success` a protected route (Recommended)

**Change:** Remove `/checkout/success(.*)` from `PUBLIC_ROUTE_PATTERNS` in `lib/public-routes.ts`.

**Effect:** `clerkMiddleware` will call `auth.protect()` for this route, which:
1. Validates the session token
2. Refreshes the JWT if expired but session is still valid
3. Redirects to sign-in with `returnBackUrl` if session is invalid

**The checkout success page code simplifies:**
```typescript
// auth.protect() already ran in middleware — userId is guaranteed non-null
const clerkAuth = await d.getClerkAuth();
// Can remove the null check and redirectToSignIn logic
const user = await d.authGateway.requireUser();
```

**Risk:** Minimal. The only users hitting `/checkout/success` are those returning from Stripe checkout — they MUST be authenticated. There's no legitimate unauthenticated use case for this page.

### Option 2: Keep as-is (current behavior)

The code handles the edge case correctly. The `returnBackUrl` preserves the checkout session ID. The user experiences a brief sign-in → redirect cycle but no data is lost.

**When this is acceptable:** If the auth bounce is extremely rare (Safari-specific, timing-dependent) and not worth the code change.

### Option 3: Add client-side session validation on the success page

Add a loading state that checks auth client-side before triggering the server-side sync. If auth is stale, use Clerk's client-side `useAuth()` to refresh before proceeding.

**When this makes sense:** If Option 1 causes issues with Clerk's middleware redirect flow (e.g., losing the `session_id` query parameter during the middleware redirect).

---

## Open Questions (Answered by research below)

1. **Does `auth.protect()` in middleware preserve query parameters during redirect?** If the middleware redirects to sign-in and back, does `?session_id=cs_xxx` survive the round-trip? This is critical for Option 1 — if query params are lost, the eager sync fails.

2. **Is the auth bounce Safari-specific?** Testing on Chrome, Firefox, and Safari with the same flow would isolate whether ITP is the cause.

3. **How long did the user spend on Stripe checkout?** If it was >60 seconds, JWT expiration is the likely cause. If it was <10 seconds, it's more likely ITP or session propagation delay.

4. **Can we reproduce this reliably?** A manual test with timing instrumentation would confirm the root cause.

---

## Research Findings (Deep Web Search, 2026-02-25)

### 1) Is our current public `/checkout/success` + manual `auth()` check pattern the standard?

**Short answer:** It works, but it is not the strongest default for an authenticated SaaS checkout return path.

What current guidance indicates:

- **Clerk route protection guidance** in 2026 is middleware-first (`auth.protect()`), with private routes protected by default and only true public routes excluded.
- Clerk's own Stripe example (metadata + webhook guide) sets `success_url` to a **protected member page** (`/members`), not a public callback page.
- **Stripe's Checkout guidance** is webhook-first for correctness. Stripe explicitly says webhooks are required for reliable fulfillment, and the landing page redirect is mainly for immediate user UX.

**Conclusion:** For this app's flow, Option 1 (protect `/checkout/success`) is the better architecture, with webhook as source of truth and the success page as best-effort UX/eager sync.

### 2) SameSite/Lax: does Clerk already use `Lax`, and if yes why did session still fail?

**Yes, Clerk already sets `SameSite=Lax`.**

- Clerk's security and cookie docs state session cookies are set to `SameSite=Lax`.

So why can first-load auth still fail after Stripe redirect?

- Clerk's session token (`__session`) is **short-lived (60 seconds)** and refreshes every ~50 seconds while the app is active.
- During hosted Stripe Checkout, users are off your app origin, so token refresh timing can be missed; first request back may present an expired/stale token.
- In SSR flows Clerk may need a **handshake redirect** to FAPI to mint a fresh session token. If this chain is delayed/interrupted, first request can appear signed out and recover on retry/refresh.
- This behavior can be more variable in preview environments using development instances (`pk_test_` / `sk_test_`) and `accounts.dev` flows.

**Conclusion:** `Lax` is necessary but not sufficient. The observed bounce is more consistent with token-refresh/handshake timing and cross-origin flow complexity than with a misconfigured SameSite policy.

### 3) Does `auth.protect()` preserve query params like `?session_id=cs_xxx` through sign-in redirect?

Evidence from Clerk docs:

- Clerk's redirect model stores the previous URL in `redirect_url` and sends users back after sign-in.
- Middleware examples use `redirectToSignIn({ returnBackUrl: req.url })`; `req.url` is the full URL, including query params.

**Practical answer:** Query params should survive **when full URL is used as returnBackUrl**.  
For this checkout path, if we want strong guarantees, use explicit `redirectToSignIn({ returnBackUrl: req.url })` on the unauthenticated middleware branch (or keep a server fallback) rather than relying on implicit behavior alone.

### 4) Updated recommendation

Update BS-032 recommendation to:

1. **Protect `/checkout/success` in middleware** (remove it from public routes).
2. Keep **webhook-driven sync as source of truth**; treat success-page sync as UX optimization.
3. For checkout-success unauthenticated redirects, ensure full return URL is preserved (`returnBackUrl: req.url`) so `session_id` survives.
4. Avoid redirect config that can override `redirect_url` for this flow (especially sign-in force-redirect settings).
5. Add an E2E regression test: Stripe success URL with `session_id` survives one auth bounce and still completes eager sync.
6. Re-validate on a production-like environment/domain, not only preview with development Clerk keys.

### Sources

- Clerk `clerkMiddleware()` docs: https://clerk.com/docs/reference/nextjs/clerk-middleware
- Clerk `auth()` docs: https://clerk.com/docs/reference/nextjs/app-router/auth
- Clerk redirect URL behavior: https://clerk.com/docs/guides/development/customize-redirect-urls
- Clerk middleware example using `returnBackUrl: req.url`: https://clerk.com/docs/guides/development/add-onboarding-flow
- Clerk cookie behavior (`SameSite=Lax`): https://clerk.com/docs/guides/how-clerk-works/cookies
- Clerk CSRF/SameSite guidance: https://clerk.com/docs/guides/secure/best-practices/csrf-protection
- Clerk session/token/handshake internals: https://clerk.com/docs/guides/how-clerk-works/overview
- Clerk session options and browser limitations: https://clerk.com/docs/guides/secure/session-options
- Clerk environment differences (development vs production): https://clerk.com/docs/guides/development/managing-environments
- Clerk Stripe blog example (`success_url` to `/members`): https://clerk.com/blog/exploring-clerk-metadata-stripe-webhooks
- Stripe Checkout fulfillment guidance (webhooks required + success_url pattern): https://docs.stripe.com/checkout/fulfillment
- Next.js discussion referenced in this BS: https://github.com/vercel/next.js/discussions/17612

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-25 | Created BS-032 | Observed auth bounce during manual testing of new-user Apple OAuth → Stripe checkout flow on Preview deployment |
