# BUG-117: Stripe Customer Creation Non-Idempotent Path Missing Retry Wrapper

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

When `createStripeCustomer()` is called without an `idempotencyKey`, the Stripe API call is made directly without `callStripeWithRetry()`. The idempotent path (with key) correctly uses the retry wrapper, but the non-idempotent fallback path does not.

## Steps to Reproduce

1. Call `createStripeCustomer()` with no `idempotencyKey` option
2. Have Stripe return a transient network error (timeout, 5xx)
3. Observe the call fails without retry

## Root Cause

Conditional logic at `stripe-customers.ts:83-93` only wraps the idempotent branch in `callStripeWithRetry()`:

```typescript
const customer = idempotencyKey
  ? await callStripeWithRetry({ ... })      // ← has retry
  : await stripe.customers.create(params);  // ← NO retry
```

## Fix

Wrap both branches in `callStripeWithRetry()`:

```typescript
const customer = await callStripeWithRetry({
  operation: 'customers.create',
  fn: () => stripe.customers.create(params, idempotencyKey ? { idempotencyKey } : undefined),
  logger,
});
```

## Verification

- [x] Both paths (with and without idempotency key) use `callStripeWithRetry()`
- [x] Existing tests pass
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `src/adapters/gateways/stripe/stripe-customers.ts:83-93`
- DEBT-162 (resolved) — Similar issue in Stripe portal session creation
