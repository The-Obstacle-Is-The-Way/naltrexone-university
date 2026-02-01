# DEBT-003: SubscriptionRepository Missing update() Method

**Status:** Resolved
**Priority:** P1
**Date:** 2026-01-31
**Resolved:** 2026-02-01

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

## Resolution

- Added `SubscriptionUpsertInput`, `SubscriptionRepository.upsert()`, and `SubscriptionRepository.findByStripeSubscriptionId()` to `src/application/ports/repositories.ts`.
- Implemented `findByStripeSubscriptionId()` + `upsert()` in `src/adapters/repositories/drizzle-subscription-repository.ts`:
  - Upsert is keyed by `userId` (1 row per user per SSOT).
  - Stores `stripeSubscriptionId` and mapped `priceId` (from domain `plan` + adapter config).
  - Maps Postgres unique-constraint violations to `ApplicationError('CONFLICT', ...)`.
- Added integration test coverage in `tests/integration/repositories.integration.test.ts`.
- Updated `FakeSubscriptionRepository` to implement the new port methods.
