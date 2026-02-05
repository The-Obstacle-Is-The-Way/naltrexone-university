# BUG-070: E2E Test User Checkout Failed (Stripe `this` Binding Bug)

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-05
**Resolved:** 2026-02-05

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

Gmail OAuth user checkout succeeded because they already had a local `stripe_customers` mapping row, so checkout exited early and never exercised Stripe customer creation/search.

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

## Root Cause

`src/adapters/gateways/stripe/stripe-customers.ts` extracted `stripe.customers.search` into a standalone function, losing the Stripe SDK resource `this` binding. When invoked, Stripe attempted to call `this._makeRequest(...)`, but `this` was `undefined`, so the process threw **before any Stripe API request**.

This exactly matches observed behavior:
- No Stripe customer created for the E2E user
- Failure occurs in server code before Stripe receives a request
- Users with an existing local mapping are unaffected

## Fix

Bind the Stripe SDK method to preserve `this`:

```ts
const customersSearch = stripe.customers.search?.bind(stripe.customers);
```

## Verification

- [x] Regression test added: `src/adapters/gateways/stripe/stripe-customers.test.ts`
- [ ] Manual: Re-try checkout in Preview for `e2e-test@addictionboards.com` after deploy

## Blocks

- **DEBT-104**: Cannot subscribe the E2E test user → cannot run authenticated E2E tests
- **E2E testing**: All authenticated flows are blocked until this user can subscribe

## Related

- [BUG-069](./bug-069-stripe-checkout-fails-localhost.md) — same root cause, first repro surfaced on localhost
- [DEBT-104](../../debt/debt-104-missing-e2e-test-credentials.md)
