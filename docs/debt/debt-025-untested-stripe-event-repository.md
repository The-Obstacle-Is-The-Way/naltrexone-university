# DEBT-025: Untested Stripe Event Repository (Critical Payment Infrastructure)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-01

---

## Description

`drizzle-stripe-event-repository.ts` handles critical Stripe webhook event processing with idempotency, transaction locking, and event state management. Despite implementing the complex `claim()`, `lock()`, `markProcessed()`, and `markFailed()` methods, it has zero test coverage.

All other repositories in `src/adapters/repositories/` have corresponding test files except this one.

## Location

- **File:** `src/adapters/repositories/drizzle-stripe-event-repository.ts`
- **Missing:** `src/adapters/repositories/drizzle-stripe-event-repository.test.ts`

## Impact

- **Payment Integrity:** If event processing logic has bugs, subscriptions may not be created/updated correctly
- **Idempotency Failures:** Duplicate event processing could cause data corruption
- **Transaction Lock Bugs:** Could cause race conditions in concurrent webhook deliveries
- **Regression Risk:** Any refactoring has no safety net

## Methods Requiring Tests

```typescript
interface StripeEventRepository {
  claim(eventId: string, type: string): Promise<boolean>;
  lock(eventId: string): Promise<{ processedAt: Date | null; error: string | null }>;
  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;
}
```

## Resolution

Create comprehensive test file covering:

1. **claim() tests:**
   - Returns true when event is new (inserted)
   - Returns false when event already exists (ON CONFLICT DO NOTHING)
   - Correctly stores event type

2. **lock() tests:**
   - Returns event state for processing decisions
   - Works within transaction context
   - SELECT FOR UPDATE semantics (integration test)

3. **markProcessed() tests:**
   - Updates processedAt timestamp
   - Works after claim + lock

4. **markFailed() tests:**
   - Updates error column
   - Preserves error message

5. **Integration tests:**
   - Full claim → lock → markProcessed flow
   - Idempotency: duplicate claim returns false
   - Concurrent processing simulation

## Acceptance Criteria

- [ ] Test file exists at `src/adapters/repositories/drizzle-stripe-event-repository.test.ts`
- [ ] Unit tests cover all 4 public methods
- [ ] Integration tests in `tests/integration/repositories.integration.test.ts` cover Stripe event scenarios
- [ ] Tests achieve >90% line coverage for this file

## Related

- DEBT-019 (archived): Stripe Events Idempotency Port
- ADR-005: Payment Boundary
- SPEC-009: Payment Gateway
