# DEBT-016: Duplicated Upsert Pattern Across Repositories

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

The "insert or return existing" conflict resolution pattern is used in two repositories with similar (but not identical) logic. While not exact duplication, both could benefit from a shared helper.

## Locations

- **`src/adapters/repositories/drizzle-bookmark-repository.ts`** lines 23-57
- **`src/adapters/repositories/drizzle-stripe-customer-repository.ts`** lines 26-63

## Similar Patterns

### Bookmark (simpler - lines 23-57)
```typescript
// 1. Try insert
const [inserted] = await this.db.insert(bookmarks)...onConflictDoNothing().returning();
if (inserted) return inserted;

// 2. Query existing
const existing = await this.db.query.bookmarks.findFirst({...});
if (!existing) throw new ApplicationError('INTERNAL_ERROR', ...);
return existing;
```

### StripeCustomer (more complex - lines 26-63)
```typescript
// 1. Try insert
const [inserted] = await this.db.insert(stripeCustomers)...onConflictDoNothing().returning();
if (inserted) return;

// 2. Query by userId (check if same customer)
const existingByUserId = ...
if (existingByUserId) {
  if (matches) return;
  throw CONFLICT;
}

// 3. Query by stripeCustomerId (check if mapped to other user)
const existingByStripeCustomerId = ...
if (existingByStripeCustomerId) throw CONFLICT;

// 4. Unexpected state
throw INTERNAL_ERROR;
```

## Why This Is a Problem

1. **DRY Violation**: Same logic duplicated in two files
2. **Maintenance Burden**: Bug fixes (like DEBT-015 race condition) need two updates
3. **Inconsistent Error Messages**: Each file has slightly different wording
4. **Testing Burden**: Same pattern needs test coverage twice

## Fix

Extract to shared helper:

```typescript
// src/adapters/repositories/helpers/upsert-helper.ts
export async function insertOrReturnExisting<T>(
  db: Db,
  insertFn: () => Promise<[T | undefined]>,
  findFn: () => Promise<T | undefined>,
  errorMessage: string,
): Promise<T> {
  const [inserted] = await insertFn();
  if (inserted) return inserted;

  const existing = await findFn();
  if (!existing) {
    throw new ApplicationError('INTERNAL_ERROR', errorMessage);
  }
  return existing;
}
```

Then use in both repositories:
```typescript
return insertOrReturnExisting(
  this.db,
  () => this.db.insert(bookmarks).values({...}).onConflictDoNothing().returning(),
  () => this.db.query.bookmarks.findFirst({...}),
  'Failed to insert bookmark',
);
```

## Acceptance Criteria

- Shared helper extracted
- Both repositories use the helper
- Tests cover the helper once, not twice
- Fix for DEBT-015 applies to both automatically

## Resolution

This was resolved by **eliminating the duplication**, not by introducing a shared helper.

- `DrizzleStripeCustomerRepository.insert()` now uses a single upsert statement (see DEBT-015), so it no longer shares the “insert-then-query-existing” pattern used by bookmarks.
- `DrizzleBookmarkRepository` remains intentionally simple and readable; extracting a helper would add indirection without meaningful reuse.
