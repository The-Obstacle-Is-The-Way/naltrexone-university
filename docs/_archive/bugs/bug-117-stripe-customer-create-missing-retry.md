# BUG-117: Stripe Customer Creation Non-Idempotent Path Missing Retry Wrapper

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Stripe customer creation should be retried on transient Stripe/network errors. Historically, `createStripeCustomer()` had a path that could call `stripe.customers.create()` without `callStripeWithRetry()` when no idempotency key was supplied, so transient errors would fail without retry.

The fix ensures customer creation is always wrapped in `callStripeWithRetry()` and always uses an idempotency key (caller-provided or a deterministic fallback) so retries are safe.

## Steps to Reproduce

1. Call `createStripeCustomer()` with no `idempotencyKey` option
2. Have Stripe return a transient network error (timeout, 5xx)
3. Observe the call fails without retry

## Root Cause

`createStripeCustomer()` previously treated `options.idempotencyKey` as a strict switch: the keyed path used the retry wrapper, while the non-keyed fallback did not. That meant transient errors in the non-keyed path were not retried.

## Fix

Always provide an idempotency key and always wrap the call in `callStripeWithRetry()`:

```typescript
const idempotencyKey =
  options?.idempotencyKey ?? `create_stripe_customer:${input.userId}`;
const customer = await callStripeWithRetry({
  operation: 'customers.create',
  fn: () => stripe.customers.create(params, { idempotencyKey }),
  logger,
});
```

## Verification

- [x] Customer creation always uses `callStripeWithRetry()`
- [x] Missing `options.idempotencyKey` falls back to a deterministic idempotency key
- [x] Unit test asserts retry behavior for transient errors
- [x] Existing tests pass
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `src/adapters/gateways/stripe/stripe-customers.ts:83-93`
- `src/adapters/gateways/stripe/stripe-customers.test.ts`
- DEBT-162 (resolved) — Similar issue in Stripe portal session creation
