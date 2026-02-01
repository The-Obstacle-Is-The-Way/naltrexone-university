# DEBT-031: StripePaymentGateway Uses `unknown[]` Args (Type Safety Loss)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Description

The `StripeClient` interface in `stripe-payment-gateway.ts` uses `unknown[]` for method arguments, defeating TypeScript's type safety. This is overly permissive and hides the actual API contract.

## Location

- `src/adapters/gateways/stripe-payment-gateway.ts:23`

```typescript
interface StripeClient {
  checkout: {
    sessions: {
      create(...args: unknown[]): Promise<StripeCheckoutSession>;
    };
  };
}
```

## Impact

- **Type Safety:** Compiler can't catch incorrect parameters
- **Documentation:** Interface doesn't document expected inputs
- **Refactoring:** Easy to pass wrong arguments without compile error
- **IDE Support:** No autocomplete for method parameters

## Resolution

Define exact parameter types matching Stripe SDK:

```typescript
interface CheckoutSessionCreateParams {
  mode: 'subscription' | 'payment' | 'setup';
  customer: string;
  line_items: Array<{
    price: string;
    quantity: number;
  }>;
  success_url: string;
  cancel_url: string;
  metadata?: Record<string, string>;
}

interface StripeClient {
  checkout: {
    sessions: {
      create(params: CheckoutSessionCreateParams): Promise<StripeCheckoutSession>;
    };
  };
}
```

Or import types from Stripe SDK:

```typescript
import type Stripe from 'stripe';

interface StripeClient {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams
      ): Promise<Stripe.Checkout.Session>;
    };
  };
}
```

## Acceptance Criteria

- [x] `StripeClient` interface has specific parameter types
- [x] No `unknown[]` in interface definition
- [x] Tests still compile and pass
- [x] IDE provides autocomplete for create() params

## Related

- ADR-005: Payment Boundary
- ADR-011: API Design Principles
- SOLID: Interface Segregation Principle
