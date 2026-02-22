# BUG-148: Stripe Checkout Idempotency Key Fallback Uses randomUUID()

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-22

---

## Description

Before this fix, `createStripeCheckoutSession()` used a non-deterministic
fallback idempotency key when callers did not provide one:

```typescript
const idempotencyKey =
  options?.idempotencyKey ??
  `checkout_session:${input.userId}:${randomUUID()}`;
```

That behavior was idempotent per single call/retry loop, but not deterministic
across separate caller retries.

## Verified Caller Chain (UI -> Server Action -> Controller -> Use Case -> Gateway)

1. UI forms include `<IdempotencyKeyField />` in `app/pricing/pricing-view.tsx`.
2. `IdempotencyKeyField` generates a UUID in `app/pricing/pricing-client.tsx`.
3. `subscribeMonthlyAction` / `subscribeAnnualAction` read `formData.get('idempotencyKey')` in `app/pricing/subscribe-actions.ts`.
4. `createCheckoutSession` action forwards optional `idempotencyKey` in `src/adapters/controllers/billing-controller.ts`.
5. `CreateCheckoutSessionUseCase` passes optional key through in `src/application/use-cases/create-checkout-session.ts`.
6. `StripePaymentGateway.createCheckoutSession` forwards options in `src/adapters/gateways/stripe-payment-gateway.ts`.
7. `createStripeCheckoutSession` now applies deterministic fallback in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`.

## Reachability in Production

- In normal first-party pricing UI flow, the hidden idempotency key is always present, so fallback is typically not used.
- Fallback is still reachable in production if requests arrive without `idempotencyKey` (missing/tampered form submission, direct action invocation, or non-UI caller), because `idempotencyKey` is optional at controller/use-case boundaries.

## Current Mitigation Already in Code

Duplicate checkout risk is partially reduced by existing gateway behavior before session creation:

- It lists open checkout sessions for the customer.
- It reuses an open session when the price matches.
- It expires mismatched open sessions before creating a new one.

So the risk is real but lower than "always duplicates on retry".

## Contrast with Deterministic Pattern

`createStripeCustomer()` in `src/adapters/gateways/stripe/stripe-customers.ts` uses deterministic fallback:

```typescript
const idempotencyKey =
  options?.idempotencyKey ?? `create_stripe_customer:${input.userId}`;
```

Both methods now use deterministic fallbacks.

## Scope Check: Other Stripe Methods

No Stripe gateway method currently uses a random fallback pattern.
Before this fix, only `stripe-checkout-sessions.ts` did.

- `stripe-customers.ts`: deterministic fallback
- `stripe-portal.ts`: uses only caller-provided key (no random fallback)
- `stripe-checkout-sessions.ts`: now deterministic fallback (`userId + plan`)

## Root Cause

Pre-fix root cause was two conditions together:

1. Checkout idempotency key is optional at upper layers.
2. Gateway fallback uses non-deterministic `randomUUID()`.

## Resolution

Implemented deterministic fallback in
`src/adapters/gateways/stripe/stripe-checkout-sessions.ts`:

```typescript
const idempotencyKey =
  options?.idempotencyKey ??
  `checkout_session:${input.userId}:${input.plan}`;
```

This removes `randomUUID()` from fallback generation while preserving
caller-provided key precedence.

## Verification

- [x] Unit test: fallback key is deterministic for same input
- [x] Unit test: caller-provided key takes precedence

Added tests:

- `src/adapters/gateways/stripe/stripe-checkout-sessions.test.ts`
  - `uses a deterministic fallback idempotency key when caller key is missing`
  - `uses the caller-provided idempotency key when present`

## Related

- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:193-194`
- `src/adapters/gateways/stripe/stripe-customers.ts:83-84`
- `src/adapters/gateways/stripe/stripe-portal.ts:29-30`
- `app/pricing/pricing-client.tsx:7-9`
- `app/pricing/pricing-view.tsx:141-177`
- `app/pricing/subscribe-actions.ts:41-75`
