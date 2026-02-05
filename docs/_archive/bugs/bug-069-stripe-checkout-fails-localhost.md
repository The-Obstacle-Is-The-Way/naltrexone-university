# BUG-069: Stripe Checkout Fails for New Users (Lost `this` Binding)

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

Stripe checkout could fail with `INTERNAL_ERROR` for users who do not yet have a local `stripe_customers` mapping row.

This was initially observed on `localhost:3000` and appeared “environment-specific” (dev vs Vercel), but the true condition was **user-state-specific**:

- **Works** for users who already have a `stripe_customers` row (exits early in `CreateCheckoutSessionUseCase`)
- **Fails** for users who require `payments.createCustomer()` (new users / missing mapping)

**Error displayed to user:**

```text
Checkout failed (INTERNAL_ERROR). Internal error
```

**Server error:**

```text
TypeError: Cannot read properties of undefined (reading '_makeRequest')
    at createStripeCustomer
    at StripePaymentGateway.createCustomer
    at CreateCheckoutSessionUseCase.getOrCreateStripeCustomerId
```

---

## Steps to Reproduce

1. Use any environment (localhost, Preview, Production).
2. Sign in as a user who **does not** already have a local `stripe_customers` mapping row.
3. Navigate to `/pricing`.
4. Click "Subscribe Monthly" or "Subscribe Annual".
5. **Expected:** Redirect to Stripe Checkout.
6. **Actual (before fix):** Checkout fails with `INTERNAL_ERROR` and server throws `TypeError: ... _makeRequest`.

---

## Root Cause

`src/adapters/gateways/stripe/stripe-customers.ts` extracted the Stripe SDK method into a standalone function:

```ts
const customersSearch = stripe.customers.search;
// ...
customersSearch({ query, limit: 2 });
```

The Stripe SDK resource methods use `this` internally (e.g., `this._makeRequest(...)`). Extracting the method loses the `this` binding, so `this` becomes `undefined` at call-time and the SDK throws before any Stripe API request is made.

---

## Verification

**Fix verified by a regression unit test** that uses a `stripe.customers.search` implementation requiring a valid `this` context:

- `src/adapters/gateways/stripe/stripe-customers.test.ts`

---

## Fix

Bind the Stripe SDK method to preserve `this`:

```ts
const customersSearch = stripe.customers.search?.bind(stripe.customers);
```

This guarantees the method executes with the correct resource context.

---

## Related Files

- `src/adapters/gateways/stripe/stripe-customers.ts`
- `src/adapters/gateways/stripe/stripe-customers.test.ts`
- `src/application/use-cases/create-checkout-session.ts`

---

## Related

- [BUG-070](./bug-070-e2e-test-user-checkout-fails.md) — same root cause, observed on Preview
- DEBT-104: Missing E2E Test Credentials for Authenticated Flows
