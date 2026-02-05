# BUG-069: Stripe Checkout Fails on Localhost (Works on Vercel)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-05

---

## Description

Stripe checkout fails with `INTERNAL_ERROR` on localhost:3000 but works correctly on Vercel deployment.

**Error displayed to user:**
```
Checkout failed (INTERNAL_ERROR). Internal error
```

**Server error:**
```
TypeError: Cannot read properties of undefined (reading '_makeRequest')
    at createStripeCustomer
    at StripePaymentGateway.createCustomer
    at CreateCheckoutSessionUseCase.getOrCreateStripeCustomerId
```

---

## Steps to Reproduce

1. Start dev server: `pnpm dev`
2. Sign in as any user at `localhost:3000/sign-in`
3. Navigate to `/pricing`
4. Click "Subscribe Monthly" or "Subscribe Annual"
5. **Expected:** Redirect to Stripe Checkout
6. **Actual:** Error banner: "Checkout failed (INTERNAL_ERROR). Internal error"

---

## Environment

- **Fails:** `localhost:3000` (dev server via `pnpm dev`)
- **Works:** `addictionboards.com` (Vercel production)
- **Works:** Vercel preview deployments

---

## Root Cause (Hypothesis)

The error `Cannot read properties of undefined (reading '_makeRequest')` suggests the Stripe SDK client is not properly initialized in the dev environment. The Stripe client object exists but its internal `_makeRequest` method is undefined.

Possible causes:
1. **Turbopack bundling issue** - Next.js 16 uses Turbopack for dev, Webpack for production builds
2. **Module resolution difference** - The `stripe` package might be resolved differently in dev vs production
3. **Server component boundary issue** - The Stripe client (`lib/stripe.ts`) imports `server-only`, but something may be accessing it incorrectly in dev mode

---

## Verification

Environment variables are correctly set in `.env.local`:
- `STRIPE_SECRET_KEY` = `sk_test_...` (present)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_test_...` (present)
- `STRIPE_WEBHOOK_SECRET` = `whsec_...` (present)
- `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` = `price_...` (present)
- `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` = `price_...` (present)

The same keys work correctly on Vercel.

---

## Workaround

For now, subscribe users via the production site (`addictionboards.com`) or Vercel preview deployment instead of localhost.

For E2E test user: Sign in at production site and subscribe there.

---

## Investigation TODO

- [ ] Check if clearing `.next` cache and restarting fixes it
- [ ] Test with `pnpm build && pnpm start` (production mode locally)
- [ ] Compare Turbopack vs Webpack bundling of Stripe SDK
- [ ] Check if this is a known Next.js 16 / Turbopack issue
- [ ] Test with older Stripe SDK version

---

## Related Files

- `lib/stripe.ts` - Stripe client initialization
- `lib/env.ts` - Environment variable validation
- `src/adapters/gateways/stripe-payment-gateway.ts` - Gateway that calls Stripe
- `src/application/use-cases/create-checkout-session.ts` - Use case that fails

---

## Related

- DEBT-104: E2E Test Credentials - blocked by this for localhost testing
