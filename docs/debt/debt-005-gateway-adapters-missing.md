# DEBT-005: Gateway Adapters Not Implemented (Architecture Boundary Violation)

**Status:** Resolved
**Priority:** P1
**Date:** 2026-01-31
**Resolved:** 2026-02-01

## Summary

SPEC-004 and SPEC-008/009 define `AuthGateway` and `PaymentGateway` interfaces, but no adapter implementations exist in `src/adapters/gateways/`. The actual auth/payment logic lives in `lib/auth.ts` and `lib/stripe.ts`, outside the Clean Architecture boundaries.

## Impact

- ADR-007 composition root pattern not followed for auth/payments
- Use cases cannot be tested with fake gateways
- Vendor lock-in - Clerk/Stripe details leak into application layer
- Blocks proper dependency injection

## Current State

```text
src/application/ports/gateways.ts  → Interfaces defined ✅
src/adapters/gateways/             → Implementations exist ✅
lib/container.ts                   → Wires gateways (composition root) ✅
lib/auth.ts                        → Thin convenience wrapper ✅
```

## Expected State

```text
src/adapters/gateways/
├── clerk-auth-gateway.ts          → Implements AuthGateway ✅
├── stripe-payment-gateway.ts      → Implements PaymentGateway ✅
└── index.ts                       → Barrel export ✅

lib/container.ts                   → Composition root wires gateways ✅
lib/auth.ts                        → Thin wrapper, calls AuthGateway ✅
```

## Acceptance Criteria

- `src/adapters/gateways/` directory exists with gateway implementations
- Gateways implement interfaces from `src/application/ports/gateways.ts`
- Fake gateways added to `src/application/test-helpers/fakes.ts`
- Use cases inject gateways via composition root
- `lib/auth.ts` and `lib/stripe.ts` become thin convenience wrappers

## Notes

- Updated `CheckoutSessionInput` to require `stripeCustomerId` (matches `docs/specs/master_spec.md` checkout flow).
- Removed the ambiguous `processed` flag from `WebhookEventResult`; webhook idempotency belongs to `stripe_events` + controller logic.
