# ~~BUG-199~~ → INVALIDATED: Stripe Subscription Items Are Already Validated Upstream

**Created:** 2026-03-07
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md)
**Status:** Invalidated (2026-03-07)
**Reason:** The unguarded `[0]` access still exists in `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:55`, but the documented production failure mode is not reachable in the current codebase. Every production caller validates `subscription.items.data` with `stripeSubscriptionSchema`, which requires `.min(1)`, before the normalizer runs.

---

## What Was Verified

### The unsafe line exists

```typescript
const subscriptionItem = subscription.items.data[0];
const currentPeriodEndSeconds = subscriptionItem.current_period_end;
const priceId = subscriptionItem.price.id;
```

If a future caller bypassed validation and passed an empty `items.data` array directly into `normalizeStripeSubscriptionUpdate()`, this line could still throw.

### The current production path blocks the empty-array case first

`stripeSubscriptionSchema` already requires at least one item:

```typescript
items: z.object({
  data: z.array(stripeSubscriptionItemSchema).min(1),
}),
```

Current production callers all go through that schema:

1. Stripe webhook flow:
   `app/api/stripe/webhook/handler.ts`
   → `src/adapters/controllers/stripe-webhook-controller.ts`
   → `src/adapters/gateways/stripe-payment-gateway.ts`
   → `src/adapters/gateways/stripe/stripe-webhook-processor.ts`
   → `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts`
2. Stripe reconciliation job:
   `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
   → `retrieveAndNormalizeStripeSubscription()`
   → `stripeSubscriptionSchema.safeParse(...)`

### Runtime impact claim was wrong

For the documented empty-array scenario:

- the payload is rejected as `INVALID_WEBHOOK_PAYLOAD`
- `app/api/stripe/webhook/handler.ts` maps that error to HTTP `400`
- existing tests already encode this behavior

So the prior claim:

> empty `items.data` causes `TypeError` → webhook returns `500`

is not accurate for the current production path.

---

## Repository-Wide `[0]` Sweep

A full `app/` + `src/` sweep found no additional unguarded crash-risk `[0]` accesses in production code.

Other `[0]` hits are already protected by optional chaining, prior invariants, or downstream filtering, including:

- `app/(marketing)/checkout/success/checkout-success-sync.tsx`
- `src/adapters/gateways/clerk-auth-gateway.ts`
- `src/adapters/controllers/clerk-webhook-controller.ts`
- `src/application/use-cases/get-session-history.ts`
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`
- `src/adapters/gateways/stripe/stripe-customers.ts`
- `src/domain/services/grading.ts`
- `src/adapters/repositories/drizzle-question-repository.ts`

---

## Residual Note

This file is preserved because the line itself is still a latent local hazard if a future refactor introduces a new caller that skips schema validation. Today, though, that is defensive debt at the function boundary, not a live production bug.
