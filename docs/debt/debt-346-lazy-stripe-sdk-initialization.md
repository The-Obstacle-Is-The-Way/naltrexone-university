# DEBT-346: Lazy Initialization of Stripe SDK in Container

**Priority:** P3
**Created:** 2026-04-02
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [lib/container.ts](../../lib/container.ts), [lib/container/gateways.ts](../../lib/container/gateways.ts), [lib/container/types.ts](../../lib/container/types.ts), [lib/stripe.ts](../../lib/stripe.ts)

---

## Context

The composition root eagerly imports [`lib/stripe.ts`](../../lib/stripe.ts), which instantiates the Stripe SDK at module load time. [`lib/container.ts`](../../lib/container.ts) then stores that instance in `ContainerPrimitives`, and [`lib/container/gateways.ts`](../../lib/container/gateways.ts) threads it into Stripe gateway factories.

This means **every route that imports the container** pays Stripe SDK initialization cost, even when the route never touches billing.

On Vercel serverless functions, that matters most on cold starts.

---

## The Problem

### Current Flow

```
lib/stripe.ts (module load):
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { ... })
  // executes on first import, regardless of route needs

lib/container.ts:
  import { stripe } from './stripe'
  // triggers stripe.ts evaluation

any route that imports createContainer():
  const container = createContainer()
  // Stripe is already initialized even if only auth/db work is needed
```

### Routes That Import Container but Do Not Need Stripe

| Route area | Uses Stripe directly? | Still pays Stripe init cost today? |
|-----------|------------------------|------------------------------------|
| Dashboard | No | Yes |
| Practice | No | Yes |
| Bookmarks | No | Yes |
| History | No | Yes |
| Question view/review | No | Yes |
| Billing / checkout / webhooks / reconciliation | Yes | Yes |

Only a minority of the current route groups actually need Stripe.

---

## Proposed Fix

### Change `lib/stripe.ts` to a Lazy Factory

```typescript
import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    });
  }

  return stripeInstance;
}
```

### Update Container Primitives + Gateway Wiring

Instead of storing a ready-made Stripe client in `ContainerPrimitives`, store a lazy accessor or instantiate Stripe only inside the payment-gateway factory path.

### Update Stripe Gateway Constructors or Factories

The Stripe gateways can:

- call `getStripe()` on first use, or
- receive the concrete Stripe client only when `createPaymentGateway()` is called

Either approach is architecture-compatible. The important part is that non-billing routes stop initializing Stripe just by importing the container.

---

## What About Database and Sentry?

### Database (`lib/db.ts`)

Leave it eager:

- almost every route needs it
- it already uses a singleton pattern
- lazy-loading it would add complexity for little gain

### Sentry (`instrumentation.ts`)

Already correct:

- initializes through Next instrumentation
- effectively gated by DSN presence

### Clerk (`lib/container.ts`)

Already follows the desired pattern. `getClerkUser` dynamically imports `@clerk/nextjs/server` only when auth lookup is actually needed.

Stripe should match that laziness.

---

## Impact

- **Cold starts:** non-billing routes stop paying Stripe SDK startup cost
- **Correctness:** unchanged
- **Architecture:** still cleanly isolated at the composition root / adapters boundary

## Testing

- Existing Stripe gateway tests should continue to work because they already inject a `StripeClient`-shaped dependency
- Add a unit test verifying `getStripe()` returns the same instance on repeated calls
- Verify non-billing routes no longer instantiate Stripe just by creating the app container

## Scope

- `lib/stripe.ts`
- `lib/container.ts` and [`lib/container/types.ts`](../../lib/container/types.ts)
- [`lib/container/gateways.ts`](../../lib/container/gateways.ts)
- Small Stripe gateway wiring adjustments if needed
- No domain/application layer changes

## Estimated Effort

~1-2 hours. Mechanical refactor with existing coverage around the gateway surface.
