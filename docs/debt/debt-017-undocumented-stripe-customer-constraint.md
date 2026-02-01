# DEBT-017: Undocumented 1-to-1 Stripe Customer Constraint

**Status:** Open
**Priority:** P3
**Date:** 2026-02-01

## Summary

The `DrizzleStripeCustomerRepository` enforces a 1-to-1 mapping between Stripe customers and internal users, but this constraint is not documented in the interface, schema, or specs.

## Location

- **File:** `src/adapters/repositories/drizzle-stripe-customer-repository.ts`
- **Lines:** 52-57

## The Implicit Constraint

```typescript
const existingByStripeCustomerId = await this.db.query.stripeCustomers.findFirst({
  where: eq(stripeCustomers.stripeCustomerId, stripeCustomerId),
});

if (existingByStripeCustomerId) {
  throw new ApplicationError(
    'CONFLICT',
    'Stripe customer id is already mapped to a different user',
  );
}
```

This enforces: **One Stripe customer → One internal user** (no sharing)

## Why This Is a Problem

1. **Undocumented Business Rule**: Not in spec, ADR, or interface JSDoc
2. **Implicit Assumption**: Future developers may not know about this constraint
3. **No Schema Enforcement**: DB doesn't have unique constraint on `stripeCustomerId`
4. **Fragile**: Rule could be violated by direct DB access or migrations

## Potential Scenarios Where This Breaks

1. **Account Merge**: User A and User B are same Stripe customer (support override)
2. **Testing**: Same test Stripe customer used for multiple test users
3. **Migration**: Importing users with shared Stripe accounts

## Fix

### Option A: Document in Interface
```typescript
/**
 * Insert a Stripe customer mapping.
 *
 * Constraints:
 * - One internal user → one Stripe customer (unique by userId)
 * - One Stripe customer → one internal user (unique by stripeCustomerId)
 *
 * @throws CONFLICT if stripeCustomerId is already mapped to different user
 */
insert(userId: string, stripeCustomerId: string): Promise<void>;
```

### Option B: Add DB Constraint
```sql
ALTER TABLE stripe_customers ADD CONSTRAINT stripe_customer_unique
  UNIQUE (stripe_customer_id);
```

### Option C: Document in ADR-005
Add to Payment Boundary ADR explaining the 1-to-1 assumption.

## Acceptance Criteria

- Business rule documented somewhere (interface, ADR, or schema)
- Ideally enforced at DB level, not just application level
- Tests verify the constraint behavior
