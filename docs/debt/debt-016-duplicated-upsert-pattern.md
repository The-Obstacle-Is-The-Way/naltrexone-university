# DEBT-016: Duplicated Upsert Pattern Across Repositories

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

## Summary

The "insert or return existing" conflict resolution pattern is duplicated across two repositories with nearly identical logic.

## Locations

- **`src/adapters/repositories/drizzle-bookmark-repository.ts`** lines 23-57
- **`src/adapters/repositories/drizzle-stripe-customer-repository.ts`** lines 26-63

## Duplicated Pattern

```typescript
// Both files have this ~30 line pattern:

// 1. Try insert with onConflictDoNothing
const [inserted] = await this.db
  .insert(table)
  .values({ ... })
  .onConflictDoNothing()
  .returning();

if (inserted) return inserted;

// 2. Fallback query
const existing = await this.db.query.table.findFirst({...});

// 3. Error if still missing
if (!existing) {
  throw new ApplicationError('INTERNAL_ERROR', 'Failed to insert...');
}

return existing;
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
