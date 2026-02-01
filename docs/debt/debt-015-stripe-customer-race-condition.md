# DEBT-015: Complex Fallback Logic in DrizzleStripeCustomerRepository.insert()

**Status:** Open
**Priority:** P3 (downgraded from P1 - not a data integrity issue)
**Date:** 2026-02-01

## Summary

The `insert()` method uses a complex multi-query fallback pattern instead of a simpler atomic approach. While the DB constraints prevent data corruption, the code is harder to reason about.

## Location

- **File:** `src/adapters/repositories/drizzle-stripe-customer-repository.ts`
- **Lines:** 26-63

## The Pattern

```typescript
// Step 1: Try insert, silently ignore conflict
const [inserted] = await this.db
  .insert(stripeCustomers)
  .values({ userId, stripeCustomerId })
  .onConflictDoNothing()
  .returning();

if (inserted) return;

// Step 2: Multiple fallback queries to understand why insert failed
const existingByUserId = await this.db.query.stripeCustomers.findFirst({...});
// ... more queries and error handling
```

## Why This Is NOT a Data Integrity Issue

The DB has two unique constraints (verified in schema):
- `stripe_customers_user_id_uq` - one Stripe customer per user
- `stripe_customers_stripe_customer_id_uq` - one user per Stripe customer

These constraints prevent the race condition scenario originally described. Concurrent inserts with the same `userId` will BOTH conflict, not just one.

## Why This Is Still a Code Quality Issue

1. **Complexity**: 40 lines of fallback logic when simpler approaches exist
2. **Multiple Queries**: Could be reduced to one atomic statement
3. **Hard to Test**: Race conditions are hard to test even if not dangerous
4. **Redundant**: DB constraints already enforce the invariants

## Simpler Alternatives

### Option A: ON CONFLICT DO UPDATE with RETURNING
```typescript
const [row] = await this.db
  .insert(stripeCustomers)
  .values({ userId, stripeCustomerId })
  .onConflictDoUpdate({
    target: stripeCustomers.userId,
    // No-op update so RETURNING always yields the existing row.
    // Then compare and reject conflicting mappings.
    set: { stripeCustomerId: stripeCustomers.stripeCustomerId },
  })
  .returning();

if (row?.stripeCustomerId !== stripeCustomerId) {
  throw new ApplicationError(
    'CONFLICT',
    'Stripe customer already exists with a different stripeCustomerId',
  );
}
```

### Option B: Trust the DB constraint
```typescript
try {
  await this.db.insert(stripeCustomers).values({ userId, stripeCustomerId });
} catch (e) {
  if (isUniqueConstraintViolation(e)) {
    throw new ApplicationError('CONFLICT', 'Stripe customer already exists');
  }
  throw e;
}
```

## Acceptance Criteria

- Simplify to single atomic statement
- Remove multi-query fallback pattern
- Maintain same business logic (reject conflicting mappings)
