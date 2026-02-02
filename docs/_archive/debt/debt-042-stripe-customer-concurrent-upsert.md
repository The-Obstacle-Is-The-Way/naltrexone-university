# DEBT-042: Race Condition in Stripe Customer Concurrent Upsert

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-01
**Resolved:** 2026-02-02

---

## Description

The Stripe webhook controller handles concurrent webhook events, but there's a potential race condition when multiple events for the same customer arrive simultaneously.

The `stripeCustomers.insert()` call in the webhook controller can throw `CONFLICT` if:
1. Two concurrent webhook events attempt to insert the same `stripeCustomerId`
2. Or the same `userId` is associated with different `stripeCustomerId` values

When this happens, the error is caught and the webhook is effectively retried, but without backoff or coordination:

```typescript
// stripe-webhook-controller.ts:67-70
catch (error) {
  await stripeEvents.markFailed(event.eventId, toErrorMessage(error));
  throw error;  // Stripe will retry
}
```

## Impact

- **Retry storms:** Multiple conflicting webhooks can cause repeated failures
- **Wasted resources:** Duplicate processing attempts without exponential backoff
- **Potential data inconsistency:** Race between conflicting customer mappings

## Location

- `src/adapters/controllers/stripe-webhook-controller.ts:50-54`
- `src/adapters/repositories/drizzle-stripe-customer-repository.ts`

## Resolution

This is already addressed:

- `DrizzleStripeCustomerRepository.insert()` uses a single upsert statement (`ON CONFLICT DO UPDATE`) keyed on `userId` and treats the "same mapping" case as idempotent (no error).
- True conflicts (same user with a different customer id, or a customer id mapped to a different user) still throw `CONFLICT` — which is correct because it indicates inconsistent identity mapping.

## Verification

- [x] Verified repository uses a single upsert statement (no read-before-write)
- [x] Verified unit tests cover idempotent inserts and conflict cases
- [x] No behavior change required

## Related

- DEBT-015 (archived) - Previous Stripe customer race condition work
- SPEC-011 (Paywall) - Stripe webhook handling requirements
- `stripe_events` table - Idempotency tracking
