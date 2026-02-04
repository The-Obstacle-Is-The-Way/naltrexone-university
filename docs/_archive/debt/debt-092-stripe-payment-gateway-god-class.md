# DEBT-092: StripePaymentGateway is a God Class (SRP + Separation Pressure)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-04
**Archived:** 2026-02-04

---

## Description

`StripePaymentGateway` had accumulated multiple responsibilities (retry logic, customer creation, checkout session orchestration, portal session creation, webhook parsing/normalization) in a single large module.

## Resolution

Decomposed the implementation into focused adapter-owned modules under `src/adapters/gateways/stripe/` while keeping behavior and the `PaymentGateway` interface unchanged:

- `stripe-client.ts`: Stripe client type surface used by the gateway
- `stripe-retry.ts`: retry/backoff wrapper with structured logging
- `stripe-customers.ts`: customer creation
- `stripe-checkout-sessions.ts`: checkout session creation + open-session reuse/expire logic
- `stripe-portal.ts`: billing portal sessions
- `stripe-webhook-schemas.ts`: Zod schemas + subscription event types
- `stripe-subscription-normalizer.ts`: subscription retrieval + normalization
- `stripe-webhook-processor.ts`: webhook signature verification + subscription update extraction

`src/adapters/gateways/stripe-payment-gateway.ts` is now a thin façade that wires dependencies and delegates to these modules.

## Verification

- Unit: `pnpm test --run src/adapters/gateways/stripe-payment-gateway.test.ts`
- Full suite gates remain green:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test --run`

