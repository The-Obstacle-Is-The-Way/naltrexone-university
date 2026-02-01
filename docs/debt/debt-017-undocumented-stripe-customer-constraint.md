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

**Note:** The schema DOES have a unique constraint (`stripe_customers_stripe_customer_id_uq` in `db/schema.ts` lines 118-120), so the DB enforces this. The issue is purely documentation - the interface at `src/application/ports/repositories.ts` lines 95-98 has no JSDoc explaining the constraint.

## Potential Scenarios to Consider

1. **Account Merge**: If User A and User B need to share a Stripe customer (support override), the constraint prevents this
2. **Testing**: Same test Stripe customer cannot be reused for multiple test users

These may be intentional business rules - they just need to be documented.

## Fix

### Option A: Document in Interface (Recommended)
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

### Option B: Document in ADR-005
Add to Payment Boundary ADR explaining the 1-to-1 assumption.

## Acceptance Criteria

- Business rule documented in interface JSDoc
- ADR-005 mentions the 1-to-1 constraint as a design decision
