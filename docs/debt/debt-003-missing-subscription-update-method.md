# DEBT-003: SubscriptionRepository Missing update() Method

**Status:** Open
**Priority:** P1
**Date:** 2026-01-31

## Summary

The `DrizzleSubscriptionRepository` only has a `findByUserId()` method. There is no way to update a subscription record after it's created.

## Impact

- Cannot persist subscription state changes from Stripe webhooks
- Subscription status (active → canceled → expired) cannot be updated
- Period end dates cannot be updated on renewal
- Blocks Stripe webhook handler implementation (SPEC-009)

## Location

- **File:** `src/adapters/repositories/drizzle-subscription-repository.ts`
- **Port:** `src/application/ports/repositories.ts` - `SubscriptionRepository` interface

## Current State

```typescript
interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;
  // Missing: update(), create(), delete()
}
```

## Required Methods

Per SPEC-007 and webhook processing needs:

```typescript
interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;
  findByStripeSubscriptionId(stripeSubId: string): Promise<Subscription | null>;
  upsert(subscription: Subscription): Promise<void>;
}
```

## Acceptance Criteria

- `SubscriptionRepository` interface includes `upsert()` method
- Drizzle implementation handles insert-or-update semantics
- Stripe subscription ID lookup enabled for webhook processing
- Integration tests cover upsert behavior
