# BUG-148: Stripe Checkout Idempotency Key Fallback Uses randomUUID()

**Status:** Open
**Priority:** P3
**Date:** 2026-02-22

---

## Description

The Stripe checkout session creation helper in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:194-196` uses a `randomUUID()` fallback when no idempotency key is provided by the caller:

```typescript
const idempotencyKey =
  options?.idempotencyKey ??
  `checkout_session:${input.userId}:${randomUUID()}`;
```

This defeats Stripe's idempotency guarantee. If a network error causes the SDK to retry the request internally, the fallback key would already be set (so the retry IS idempotent within a single call). However, if the **caller** retries at a higher level (e.g., due to a timeout), a new `randomUUID()` would be generated, and Stripe would create a duplicate checkout session.

Compare with the customer creation helper in `stripe-customers.ts`, which uses a deterministic key:

```typescript
const idempotencyKey =
  options?.idempotencyKey ?? `create_stripe_customer:${input.userId}`;
```

## Current Impact

**Latent / Low** — The production flow always provides a client-generated idempotency key via `<IdempotencyKeyField>` in `app/pricing/pricing-client.tsx`. The fallback path is currently unreachable in normal user flows.

## Steps to Reproduce

1. Call `createStripeCheckoutSession()` without passing `options.idempotencyKey`
2. Observe that the generated key includes `randomUUID()`
3. If the caller retries the call, a different key is generated
4. Stripe treats the retry as a new request → duplicate checkout session created

## Root Cause

The fallback idempotency key is non-deterministic. It should be derived from stable input properties (e.g., `userId + plan`) rather than a random value.

## Recommended Fix

Change the fallback to a deterministic key based on the checkout input:

```typescript
const idempotencyKey =
  options?.idempotencyKey ??
  `checkout_session:${input.userId}:${input.plan}`;
```

Or, if concurrent checkout sessions for different plans must be supported:

```typescript
const idempotencyKey =
  options?.idempotencyKey ??
  `checkout_session:${input.userId}:${input.plan}:${Date.now()}`;
```

Note: A timestamp-based key still allows retries within the same second but prevents cross-second duplicates. A fully deterministic key (without timestamp) is safer.

## Verification

- [ ] Unit test: verify fallback key is deterministic given the same input
- [ ] Regression test: verify caller-provided key takes precedence

## Related

- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:194-196`
- `src/adapters/gateways/stripe/stripe-customers.ts` (correct deterministic pattern)
- `app/pricing/pricing-client.tsx` (client-generated idempotency key)
- BUG-096: `toggleBookmark` missing idempotency key (resolved)
- BUG-091: `endPracticeSession` missing idempotency key (resolved)
