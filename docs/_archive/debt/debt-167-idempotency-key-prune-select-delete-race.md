# DEBT-167: Idempotency Key Prune Uses Non-Atomic SELECT→DELETE

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

`DrizzleIdempotencyKeyRepository.pruneExpiredBefore()` selects rows to delete in one query, then deletes them in a separate query using composite WHERE conditions:

```typescript
const rows = await this.db.select(...).where(lt(expiresAt, cutoff)).limit(limit);
const conditions = rows.map((row) => and(
  eq(idempotencyKeys.userId, row.userId),
  eq(idempotencyKeys.action, row.action),
  eq(idempotencyKeys.key, row.key),
));
await this.db.delete(idempotencyKeys).where(or(...conditions));
```

Between the SELECT and DELETE, another process could:
- Insert a new record with the same `(userId, action, key)` that is NOT expired
- The DELETE would match and remove the new non-expired record

## Impact

- Very low probability: requires a new idempotency claim for the exact same `(userId, action, key)` triple during the pruning window
- Idempotency keys are scoped to UUIDs, making collisions essentially impossible
- This is a theoretical race condition, not a practical one

## Resolution

Retained the select-then-delete shape (for compatibility with current Drizzle patterns), but hardened the delete conditions:

- Delete WHERE now includes `expiresAt < cutoff` in addition to `(userId, action, key)`
- This prevents deleting a reclaimed (non-expired) key if it is updated between SELECT and DELETE

## Verification

- [x] DELETE conditions include `expiresAt < cutoff` guard
- [x] Unit test verifies the guard is present in delete conditions

## Related

- `src/adapters/repositories/drizzle-idempotency-key-repository.ts`
- `src/adapters/repositories/drizzle-idempotency-key-repository.test.ts`
