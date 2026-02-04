# DEBT-092: StripePaymentGateway is a God Class (SRP + Separation Pressure)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-04

---

## Description

`StripePaymentGateway` currently centralizes many responsibilities in a single 600+ line module.

Evidence:

- `src/adapters/gateways/stripe-payment-gateway.ts` is 603 lines.
- It contains at least:
  - Stripe API retry/backoff wrappers
  - Customer creation
  - Checkout session reuse/expire orchestration
  - Billing portal session creation
  - Webhook signature verification + event parsing + subscription normalization

Major method entry points:

- `createCustomer` (`src/adapters/gateways/stripe-payment-gateway.ts:324`)
- `createCheckoutSession` (`src/adapters/gateways/stripe-payment-gateway.ts:353`)
- `createPortalSession` (`src/adapters/gateways/stripe-payment-gateway.ts:445`)
- `processWebhookEvent` (`src/adapters/gateways/stripe-payment-gateway.ts:473`)

## Impact

- **Harder to reason about:** unrelated concerns live together.
- **Harder to test:** unit tests become broad or require extensive setup.
- **Change amplification:** a small change to webhook parsing risks affecting checkout logic.
- **Boundary confusion:** “gateway” responsibilities mix with orchestration and normalization logic.

## Resolution

### Recommended: Decompose into focused adapter modules (no behavior change)

Keep the `PaymentGateway` interface but split implementation details into smaller units owned by the adapters layer, for example:

- `stripe-retry.ts` (shared retry/backoff wrapper)
- `stripe-customers.ts` (create + validate)
- `stripe-checkout-sessions.ts` (list/reuse/expire/create)
- `stripe-portal.ts` (portal session creation)
- `stripe-webhook-parser.ts` (constructEvent + safe schema parsing)
- `stripe-subscription-normalizer.ts` (map Stripe payload → `SubscriptionUpsertInput` or equivalent)

`StripePaymentGateway` becomes a thin façade wiring these modules together.

## Verification

- No behavior changes: existing unit/integration tests remain green.
- `StripePaymentGateway` shrinks materially and delegates to extracted helpers.
- Lint/typecheck remain clean.

## Related

- `src/application/ports/gateways.ts` (`PaymentGateway`)
- `docs/specs/spec-009-payment-gateway.md`
- `src/adapters/gateways/stripe-payment-gateway.ts`

