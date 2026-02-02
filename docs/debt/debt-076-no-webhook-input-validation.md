# DEBT-076: No Schema Validation on Webhook Payloads

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Description

Stripe and Clerk webhook handlers use TypeScript `as` assertions on untrusted external data instead of runtime schema validation. This is a security and reliability anti-pattern.

## Current State

```typescript
// stripe-payment-gateway.ts:280
const subscription = event.data.object as StripeSubscriptionLike;
const userId = subscription.metadata?.user_id;  // Could be undefined
```

```typescript
// clerk-webhook-controller.ts:70-76
if (event.type === 'user.updated') {
  const email = event.data.email_addresses?.[0]?.email_address;  // Duck typing
```

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

1. **Create Zod schemas** for all webhook event types we handle
2. **Validate at handler boundary** — Before any business logic
3. **Log validation failures** — With enough context to debug
4. **Return 400** on invalid payloads (Stripe will stop retrying)

## Files to Update

- `src/adapters/gateways/stripe-payment-gateway.ts` — Add schemas for subscription events
- `src/adapters/controllers/clerk-webhook-controller.ts` — Add schemas for user events
- `app/api/stripe/webhook/handler.ts` — Validate before processing
- `app/api/webhooks/clerk/handler.ts` — Validate before processing

## Verification

- [ ] All webhook handlers use Zod validation
- [ ] Invalid payloads return 400, not 500
- [ ] Validation errors are logged with context
- [ ] Tests include malformed payload scenarios

## Related

- BUG-045: Would have been caught by schema validation
- DEBT-075: VCR cassettes ensure schemas match reality
- OWASP Input Validation Cheat Sheet
