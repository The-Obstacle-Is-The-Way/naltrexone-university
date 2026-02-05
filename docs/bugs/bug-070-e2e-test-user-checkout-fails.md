# BUG-070: E2E Test User Checkout Fails on Preview Deployment

**Status:** Open
**Priority:** P1
**Date:** 2026-02-05

---

## Problem

The E2E test user (`e2e-test@addictionboards.com`) can sign in to the Preview deployment but cannot complete Stripe checkout. Clicking "Subscribe Annual" or "Subscribe Monthly" results in:

```
Checkout failed. Please try again.
```

No error code is shown because Preview deployments run with `NODE_ENV=production`, which hides detailed error messages.

## Context

- **Deployment:** Vercel Preview (`*.vercel.app`)
- **Clerk:** Development instance (pk_test_*, sk_test_*)
- **User:** `e2e-test@addictionboards.com` (created manually in Clerk Development dashboard)
- **Stripe:** Same key shared across all Vercel environments

## Observed Behavior

1. E2E test user signs in successfully via Clerk Development
2. User sees pricing page with "Subscription required to access the app."
3. User clicks "Subscribe Annual"
4. Server action runs, fails, redirects to `/pricing?checkout=error`
5. Error: "Checkout failed. Please try again."

## Working Comparison

- Gmail user (signed in via OAuth) was previously able to subscribe
- Unclear if Gmail user checkout still works NOW or only worked previously

## Checkout Flow (for debugging)

```
Subscribe button click
  → subscribeAnnualAction (server action)
    → createCheckoutSession (billing controller)
      → requireUser() → upserts user in DB via Clerk data
      → getClerkUserId() → raw Clerk user ID
      → CreateCheckoutSessionUseCase.execute()
        → getOrCreateStripeCustomerId() → finds or creates Stripe customer
        → payments.createCheckoutSession() → calls Stripe API
          → Returns { url } → redirect to Stripe
```

## Hypotheses

1. **Stripe customer creation fails** - The E2E test user doesn't have an existing Stripe customer. The `createCustomer` call might fail.

2. **NEXT_PUBLIC_APP_URL mismatch** - If set to `https://addictionboards.com`, the success/cancel URLs would point to Production (which is broken), not the Preview URL. This wouldn't prevent checkout session creation though.

3. **Stripe API key type mismatch** - Same `STRIPE_SECRET_KEY` is used for all environments. If it's a live key (`sk_live_*`), test flows won't work.

4. **Related to BUG-069** - Stripe SDK initialization issue. BUG-069 documented this on localhost (Turbopack), but could also affect Preview.

## Investigation Needed

- [ ] Check Vercel dashboard → Logs tab for the actual server-side error
- [ ] Verify `STRIPE_SECRET_KEY` type: is it `sk_test_*` or `sk_live_*`?
- [ ] Verify `NEXT_PUBLIC_APP_URL` value on Preview vs Production
- [ ] Test if Gmail user checkout still works on current Preview deployment
- [ ] Check if Stripe customer was created for the E2E test user

## Key Finding

**The error happens in our server code BEFORE any Stripe API call.** Stripe sandbox shows zero API requests from the E2E test user. The `INTERNAL_ERROR` is thrown by our code, not by Stripe.

This means the bug is in the checkout flow between Clerk auth and Stripe customer creation — likely in `requireUser()`, `getClerkUserId()`, or `getOrCreateStripeCustomerId()`.

## Blocks

- **DEBT-104**: Cannot subscribe the E2E test user → cannot run authenticated E2E tests
- **E2E testing**: All authenticated flows are blocked until this user can subscribe

## Resolution

Pending investigation. Root cause analysis delegated to separate debugging session.

## Related

- [BUG-069](./bug-069-stripe-checkout-fails-localhost.md): Stripe checkout fails on localhost
- [DEBT-104](../debt/debt-104-missing-e2e-test-credentials.md): E2E test credentials setup
