# DEBT-015: Race Condition in DrizzleStripeCustomerRepository.insert()

**Status:** Open
**Priority:** P1
**Date:** 2026-02-01

## Summary

The `insert()` method has a TOCTOU (Time-Of-Check-Time-Of-Use) race condition between the insert attempt and fallback queries.

## Location

- **File:** `src/adapters/repositories/drizzle-stripe-customer-repository.ts`
- **Lines:** 26-63

## The Problem

```typescript
// Step 1: Try insert, silently ignore conflict
const [inserted] = await this.db
  .insert(stripeCustomers)
  .values({ userId, stripeCustomerId })
  .onConflictDoNothing()
  .returning();

if (inserted) return;

// RACE WINDOW: Another request could insert/modify here

// Step 2: Fallback queries to check state
const existingByUserId = await this.db.query.stripeCustomers.findFirst({...});
// State may have changed between Step 1 and Step 2
```

## Why This Is a Problem

1. **Data Integrity Risk**: Under concurrent Stripe webhooks, could create inconsistent mappings
2. **Non-Deterministic**: Race failures are intermittent, hard to reproduce
3. **Silent Corruption**: Could map wrong Stripe customer to user
4. **Missing Transaction**: Multi-step DB operations without atomicity guarantee

## Scenario

1. Request A: Insert user-1 → cus_AAA (conflict, onConflictDoNothing)
2. Request B: Insert user-1 → cus_BBB (succeeds, different customer ID!)
3. Request A: Query for user-1 → finds cus_BBB (wrong customer!)
4. Request A: Returns success, but used wrong Stripe customer

## Fix

Wrap in a transaction:

```typescript
async insert(userId: string, stripeCustomerId: string): Promise<void> {
  await this.db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(stripeCustomers)
      .values({ userId, stripeCustomerId })
      .onConflictDoNothing()
      .returning();

    if (inserted) return;

    // Fallback queries inside same transaction
    const existing = await tx.query.stripeCustomers.findFirst({...});
    // ...
  });
}
```

Or use `ON CONFLICT DO UPDATE` to handle atomically.

## Acceptance Criteria

- Insert operation is atomic (transaction or single statement)
- Concurrent insert tests added
- No race window between insert and fallback
