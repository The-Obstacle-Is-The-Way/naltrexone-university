# DEBT-042: Race Condition in Stripe Customer Concurrent Upsert

**Status:** Open
**Priority:** P3
**Date:** 2026-02-01

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

Consider one of these approaches:

1. **Advisory locking:** Use Postgres advisory locks per customer to serialize processing

2. **Conflict resolution:** Use `ON CONFLICT DO UPDATE` instead of `ON CONFLICT DO NOTHING` to handle the race properly

3. **Queue serialization:** Process webhook events per customer sequentially (requires infrastructure changes)

4. **Idempotent upsert:** Modify `insert()` to be truly idempotent by ignoring conflicts if the data matches

For MVP, option 4 is simplest - ensure that if a conflict occurs but data matches, it's not an error.

## Verification

- [ ] Add integration test for concurrent webhook processing
- [ ] Verify conflict handling doesn't lose events
- [ ] Monitor webhook failure rate in production

## Related

- DEBT-015 (archived) - Previous Stripe customer race condition work
- SPEC-011 (Paywall) - Stripe webhook handling requirements
- `stripe_events` table - Idempotency tracking
