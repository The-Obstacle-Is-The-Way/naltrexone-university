# DEBT-346: Lazy Initialization of Stripe SDK in Container

**Priority:** P3
**Created:** 2026-04-02
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [lib/container.ts](../../lib/container.ts), [lib/stripe.ts](../../lib/stripe.ts)

---

## Context

The composition root (`lib/container.ts`) eagerly imports `lib/stripe.ts`, which instantiates the Stripe SDK at module load time. This means **every route that imports the container** — including dashboard, practice, bookmarks, and other non-billing pages — pays the cost of Stripe SDK initialization.

On Vercel serverless functions, module initialization happens on every cold start. The Stripe SDK isn't huge, but it's unnecessary overhead for the majority of routes.

---

## The Problem

### Current Flow

```
lib/stripe.ts (module load):
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { ... })
  // ↑ Executes on first import, regardless of whether Stripe is needed

lib/container.ts (line 17):
  import { stripe } from './stripe';
  // ↑ Triggers stripe.ts module evaluation

app/(app)/app/dashboard/page.tsx:
  const { createContainer } = await import('@/lib/container');
  // ↑ Dynamic import of container, but container still eagerly pulls in Stripe
```

### Routes That Import Container but Never Use Stripe

| Route | Uses Stripe? | Still Pays Stripe Init Cost? |
|-------|-------------|---------------------------|
| Dashboard | No | Yes |
| Practice (all modes) | No | Yes |
| Bookmarks | No | Yes |
| History | No | Yes |
| Question View | No | Yes |
| **Billing** | **Yes** | Yes |
| **Checkout Success** | **Yes** | Yes |
| **Stripe Webhook** | **Yes** | Yes |
| **Cron Reconciliation** | **Yes** | Yes |

Only 4 out of ~8 route groups actually need Stripe.

---

## Proposed Fix

### Change `lib/stripe.ts` to a Lazy Factory

```typescript
// lib/stripe.ts — BEFORE
import Stripe from 'stripe';
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-01-28.clover',
  typescript: true,
});

// lib/stripe.ts — AFTER
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

### Update Container Primitives

```typescript
// lib/container.ts — BEFORE
import { stripe } from './stripe';
// ... primitives includes stripe instance

// lib/container.ts — AFTER
import { getStripe } from './stripe';
// ... primitives includes getStripe (lazy getter)
// Stripe instance only created when a Stripe gateway is first used
```

### Update Stripe Gateway Constructors

The Stripe gateways (`stripe-checkout-sessions.ts`, `stripe-customers.ts`, `stripe-portal.ts`) would call `getStripe()` on first use rather than receiving a pre-built instance. Alternatively, the container factory functions can call `getStripe()` only when creating Stripe-specific gateways.

---

## What About Database and Sentry?

### Database (`lib/db.ts`)

The database connection is also eager, but:
- Almost every route needs it (unlike Stripe)
- It already uses a `globalThis` singleton pattern for connection reuse
- Lazy-loading it would add complexity for minimal gain

**Verdict:** Leave as-is.

### Sentry (`instrumentation.ts`)

Already conditionally eager — only initializes if `SENTRY_DSN` is set. Uses the Next.js `register()` instrumentation hook, which is the correct pattern.

**Verdict:** Already correct.

### Clerk (`lib/container.ts`)

Already lazy — `getClerkUser` is an async function that dynamically imports `@clerk/nextjs/server` only when called.

**Verdict:** Already correct. This is the pattern Stripe should follow.

---

## Impact

- **Cold start improvement:** Stripe SDK not loaded for non-billing routes (~60% of all routes)
- **Bundle size:** No change (Stripe is server-only, not in client bundle)
- **Correctness:** No change — Stripe instance is still a singleton, just lazily created

## Testing

- Existing Stripe gateway tests continue to work (they already inject Stripe as a dependency)
- Add a unit test verifying `getStripe()` returns the same instance on repeated calls
- Verify non-billing routes don't trigger Stripe initialization (check for absence of Stripe constructor log in Vercel function logs)

## Scope

- `lib/stripe.ts` — convert to lazy factory
- `lib/container.ts` — update primitives to use `getStripe()`
- Stripe gateway files — minor dependency wiring update
- No domain/application layer changes

## Estimated Effort

~1-2 hours. Mechanical refactor with existing test coverage.
