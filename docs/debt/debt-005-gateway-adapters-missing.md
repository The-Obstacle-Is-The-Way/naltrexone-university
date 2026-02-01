# DEBT-005: Gateway Adapters Not Implemented (Architecture Boundary Violation)

**Status:** Open
**Priority:** P1
**Date:** 2026-01-31

## Summary

SPEC-004 and SPEC-008/009 define `AuthGateway` and `PaymentGateway` interfaces, but no adapter implementations exist in `src/adapters/gateways/`. The actual auth/payment logic lives in `lib/auth.ts` and `lib/stripe.ts`, outside the Clean Architecture boundaries.

## Impact

- ADR-007 composition root pattern not followed for auth/payments
- Use cases cannot be tested with fake gateways
- Vendor lock-in - Clerk/Stripe details leak into application layer
- Blocks proper dependency injection

## Current State

```
src/application/ports/gateways.ts  → Interfaces defined ✅
src/adapters/gateways/             → Directory doesn't exist ❌
lib/auth.ts                        → Clerk logic here (wrong layer)
lib/stripe.ts                      → Stripe logic here (wrong layer)
```

## Expected State

```
src/adapters/gateways/
├── clerk-auth-gateway.ts          → Implements AuthGateway
├── stripe-payment-gateway.ts      → Implements PaymentGateway
└── index.ts                       → Barrel export

lib/auth.ts                        → Thin wrapper, calls gateway
lib/stripe.ts                      → Thin wrapper, calls gateway
```

## Acceptance Criteria

- `src/adapters/gateways/` directory exists with gateway implementations
- Gateways implement interfaces from `src/application/ports/gateways.ts`
- Fake gateways added to `src/application/test-helpers/fakes.ts`
- Use cases inject gateways via composition root
- `lib/auth.ts` and `lib/stripe.ts` become thin convenience wrappers
