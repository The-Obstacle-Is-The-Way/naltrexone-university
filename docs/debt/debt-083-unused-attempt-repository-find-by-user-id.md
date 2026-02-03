# DEBT-083: Unused AttemptRepository.findByUserId() — Spec-Implementation Gap

**Status:** Open
**Priority:** P3
**Date:** 2026-02-03

---

## Description

The `AttemptRepository.findByUserId(userId: string)` method is:

1. **Defined in SPEC-004** (line 200) as part of the canonical port interface
2. **Implemented** in both `DrizzleAttemptRepository` and `FakeAttemptRepository`
3. **Tested** in repository tests
4. **Never called** anywhere in production code (controllers, use cases)

This is a **spec-implementation gap**: the spec anticipated a need for this method, but during implementation we evolved to use more specific, bounded methods instead.

## Why It Exists (Spec Intent)

From SPEC-004:
```typescript
export interface AttemptRepository {
  // ...
  findByUserId(userId: string): Promise<readonly Attempt[]>;
  // ...
}
```

The spec likely intended this for:
- Bulk export of user data
- Admin/debugging views showing all user attempts
- Analytics that require full attempt history

## Why It's Currently Unused

During implementation, we created more specific, safer methods:

| Use Case | Specced Method | Actual Implementation |
|----------|----------------|----------------------|
| Dashboard stats | `findByUserId()` + compute | `countByUserId()`, `countCorrectByUserId()` |
| Recent activity | `findByUserId()` + slice | `listRecentByUserId(limit)` |
| Streak calculation | `findByUserId()` + filter | `listAnsweredAtByUserIdSince(since)` |
| Session attempts | `findByUserId()` + filter | `findBySessionId(sessionId, userId)` |

These bounded methods are more efficient and safer (no memory exhaustion risk).

## The Unbounded Query Concern

If this method WERE used, it loads all attempts without limit:

```typescript
// drizzle-attempt-repository.ts:68-72
async findByUserId(userId: string) {
  const rows = await this.db.query.attempts.findMany({
    where: eq(attempts.userId, userId),
    orderBy: desc(attempts.answeredAt),
    // NO LIMIT — loads all rows into memory
  });
  // ...
}
```

A power user with 10,000+ attempts would cause memory issues.

## Resolution Options

### Option A: Remove from Spec and Implementation (Recommended for Now)

If no current or planned feature needs all attempts unbounded:

1. Remove from SPEC-004
2. Remove from `AttemptRepository` interface
3. Remove from `DrizzleAttemptRepository`
4. Remove from `FakeAttemptRepository`
5. Remove associated tests

**Rationale:** YAGNI - we have bounded alternatives for all known use cases.

### Option B: Keep but Add Pagination

If we anticipate needing bulk access (e.g., GDPR data export):

```typescript
// Change signature to require pagination
findByUserId(
  userId: string,
  options: { limit: number; offset: number }
): Promise<readonly Attempt[]>;
```

**Rationale:** Enables bulk access safely with cursor/offset pagination.

### Option C: Keep but Add JSDoc Warning + Safe Limit

If we need it rarely but want to keep it simple:

```typescript
/**
 * Returns all attempts for a user.
 *
 * ⚠️ WARNING: This loads all attempts into memory. Only use for:
 * - GDPR data export
 * - Admin tools with low-frequency access
 *
 * For regular features, use bounded alternatives:
 * - listRecentByUserId(limit) for recent activity
 * - countByUserId() for statistics
 * - listAnsweredAtByUserIdSince() for streaks
 *
 * @internal Applies a safety limit of 10,000 rows.
 */
findByUserId(userId: string): Promise<readonly Attempt[]>;
```

Then add a hardcoded safety limit in implementation:

```typescript
async findByUserId(userId: string) {
  const SAFETY_LIMIT = 10_000;
  const rows = await this.db.query.attempts.findMany({
    where: eq(attempts.userId, userId),
    orderBy: desc(attempts.answeredAt),
    limit: SAFETY_LIMIT,
  });
  // ...
}
```

## Recommendation

**Option A (Remove)** for now because:
- No feature currently needs it
- All known use cases have bounded alternatives
- If GDPR export is needed later, we'll add it with pagination

**However**, before removing, verify with stakeholders if any planned feature needs bulk attempt access.

## Verification

After any resolution:
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] SPEC-004 and implementation are in sync
- [ ] No `findByUserId` calls on `AttemptRepository` in production code

## Related

- `docs/specs/spec-004-application-ports.md:200` — Port definition in spec
- `docs/_archive/bugs/bug-016-memory-exhaustion-power-users.md` — Previous memory issue
- `src/application/ports/repositories.ts:62` — Current port definition
- `src/adapters/repositories/drizzle-attempt-repository.ts:68` — Implementation
