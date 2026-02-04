# DEBT-076: No Schema Validation on Webhook Payloads

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02

---

## Description

Stripe and Clerk webhook handlers use TypeScript `as` assertions on untrusted external data instead of runtime schema validation. This is a security and reliability anti-pattern.

## Current State

Before resolution, webhook handlers relied on structural assumptions and
TypeScript assertions on untrusted payloads (no runtime schema validation).

## Problems

1. **`as` assertions don't validate at runtime** — TypeScript erases them
2. **If Stripe changes field names** — Silent `undefined`, not clear error
3. **Malformed payloads pass through** — Attacker could craft payloads
4. **No early failure** — Errors happen deep in business logic, not at boundary

## What Best Practice Looks Like

```typescript
import { z } from 'zod';

const StripeSubscriptionEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.object({
      id: z.string(),
      customer: z.string(),
      status: z.enum(['active', 'canceled', 'past_due', 'paused', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid']),
      metadata: z.object({
        user_id: z.string(),
      }),
      items: z.object({
        data: z.array(z.object({
          current_period_end: z.number(),
          price: z.object({ id: z.string() }),
        })),
      }),
      cancel_at_period_end: z.boolean(),
    }),
  }),
});

// In webhook handler:
const parsed = StripeSubscriptionEventSchema.safeParse(event);
if (!parsed.success) {
  logger.error({ zodError: parsed.error }, 'Invalid Stripe webhook payload');
  return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
}
const subscription = parsed.data.data.object;  // Fully typed and validated
```

## Resolution

1. **Create Zod schemas** for webhook payloads we depend on
2. **Validate at the boundary** (gateway/controller) before business logic
3. **Log validation failures** with enough context to debug
4. **Return 400** for invalid payloads (Stripe retries non-2xx); only return 2xx when the event is accepted

## Files to Update

- `src/adapters/gateways/stripe-payment-gateway.ts` — Add schemas for subscription events
- `src/adapters/controllers/clerk-webhook-controller.ts` — Add schemas for user events
- `app/api/stripe/webhook/handler.ts` — Map validation errors to 400
- `app/api/webhooks/clerk/handler.ts` — Map validation errors to 400

## Verification

- [x] Webhook handlers validate payloads with Zod (Stripe gateway + Clerk controller)
- [x] Invalid payloads return 400 (not 500)
- [x] Validation errors are logged with context
- [x] Tests cover malformed payload scenarios

## Related

- BUG-045: Would have been caught by schema validation
- DEBT-075: VCR cassettes ensure schemas match reality
- OWASP Input Validation Cheat Sheet
