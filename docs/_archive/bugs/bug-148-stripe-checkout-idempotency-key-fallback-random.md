# BUG-148: Stripe Checkout Idempotency Key Fallback Uses randomUUID()

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-22
**Resolved:** 2026-02-23

---

## Description

`createStripeCheckoutSession()` had two related issues in the fallback path used
when callers do not provide an idempotency key:

```typescript
const idempotencyKey =
  options?.idempotencyKey ??
  `checkout_session:${input.userId}:${randomUUID()}`;
```

1. The `randomUUID()` fallback made retries from separate caller attempts
non-deterministic.
2. After moving to deterministic fallback, a second edge case remained: Stripe
can replay a cached response for the deterministic key even when that returned
session is already expired/inactive.

## Verified Caller Chain (UI -> Server Action -> Controller -> Use Case -> Gateway)

1. UI forms include `<IdempotencyKeyField />` in `app/pricing/pricing-view.tsx:141`.
2. `IdempotencyKeyField` generates a UUID in `app/pricing/pricing-client.tsx:8`.
3. `subscribeMonthlyAction` and `subscribeAnnualAction` read `formData.get('idempotencyKey')` in `app/pricing/subscribe-actions.ts:46` and `app/pricing/subscribe-actions.ts:64`.
4. `createCheckoutSession` action accepts optional `idempotencyKey` and forwards it in `src/adapters/controllers/billing-controller.ts:95`.
5. `CreateCheckoutSessionUseCase` forwards optional key to payment gateway in `src/application/use-cases/create-checkout-session.ts:78`.
6. `StripePaymentGateway.createCheckoutSession` forwards options in `src/adapters/gateways/stripe-payment-gateway.ts:44`.
7. Fallback behavior lives in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:235`.

## Reachability in Production

- In normal pricing UI flow, hidden idempotency key input is present, so
fallback is uncommon.
- Fallback is still reachable in production for requests without
`idempotencyKey` (non-UI callers, malformed/tampered form submissions, or
future call sites).

## Scope Check: Other Stripe Methods

No other Stripe gateway method uses random fallback key generation:

- `src/adapters/gateways/stripe/stripe-customers.ts:83` uses deterministic fallback (`create_stripe_customer:${userId}`)
- `src/adapters/gateways/stripe/stripe-portal.ts:29` uses only caller-provided key (optional)
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:53` now uses deterministic fallback helper

## Root Cause

Two conditions caused the bug class:

1. Checkout idempotency key is optional at controller/use-case boundaries.
2. Gateway fallback behavior was unsafe:
  - pre-fix: random key (`randomUUID`) caused non-deterministic retries
  - post-initial-fix edge case: deterministic key could replay stale inactive
    session unless response is validated

## Resolution

Final implementation is two-step hardening:

1. Deterministic fallback key:

```typescript
options?.idempotencyKey ?? `checkout_session:${input.userId}:${input.plan}`;
```

2. Stale replay guard + recovery key:
- validate returned session via `status` / `expires_at`
- if inactive and fallback key was used, create once more with:

```typescript
`checkout_session_recovery:${input.userId}:${input.plan}:${session.id}`;
```

- if inactive and caller explicitly supplied idempotency key, throw
`STRIPE_ERROR` so caller can decide retry strategy

Also extended checkout session type model so adapters can inspect Stripe
response status and expiry:
- `status?: 'open' | 'complete' | 'expired' | null`
- `expires_at?: number`

## Verification

- [x] Unit test: fallback key is deterministic for same input
- [x] Unit test: caller-provided key takes precedence
- [x] Unit test: fallback path retries with recovery key when replayed session is expired
- [x] Unit test: caller-provided key path throws on expired/inactive replay

Added tests:

- `src/adapters/gateways/stripe/stripe-checkout-sessions.test.ts`
  - `uses a deterministic fallback idempotency key when caller key is missing`
  - `uses the caller-provided idempotency key when present`
  - `creates a fresh session when deterministic fallback key replays an expired session`
  - `throws STRIPE_ERROR when caller-provided key returns an expired session`

## Related

- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:38`
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:53`
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:235`
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:270`
- `src/adapters/gateways/stripe/stripe-customers.ts:83-84`
- `src/adapters/gateways/stripe/stripe-portal.ts:29-30`
- `src/adapters/shared/stripe-types.ts:33`
- `app/pricing/pricing-client.tsx:7-9`
- `app/pricing/pricing-view.tsx:141-177`
- `app/pricing/subscribe-actions.ts:41-75`
