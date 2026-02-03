# DEBT-083: AttemptRepository.findByUserId() Needs Pagination

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-03
**Updated:** 2026-02-03

---

## Description

The `AttemptRepository.findByUserId(userId: string)` method exists but is:

1. **Unbounded** — loads ALL attempts into memory with no limit
2. **Dangerous** — caused BUG-016 (memory exhaustion for power users)
3. **Currently unused** — we created bounded alternatives to fix BUG-016

The method should NOT be removed — it represents a legitimate need (GDPR data export, admin tools). But it must be made SAFE by requiring pagination.

## History

**BUG-016** documented that this method was being used by `stats-controller` and `review-controller`, causing memory exhaustion. The fix was to create bounded alternatives:

| Use Case | Old (Dangerous) | New (Safe) |
|----------|-----------------|------------|
| Total count | `findByUserId()` → `.length` | `countByUserId()` |
| Recent activity | `findByUserId()` → `.slice(0, 10)` | `listRecentByUserId(limit)` |
| 7-day stats | `findByUserId()` → filter in JS | `countByUserIdSince(since)` |
| Missed questions | `findByUserId()` → paginate in JS | `listMissedQuestionsByUserId(limit, offset)` |

The method was left in place but is now orphaned — never called but still dangerous if used.

## The Problem

```typescript
// Previous signature (DANGEROUS)
findByUserId(userId: string): Promise<readonly Attempt[]>;

// Implementation loads ALL rows
async findByUserId(userId: string) {
  const rows = await this.db.query.attempts.findMany({
    where: eq(attempts.userId, userId),
    orderBy: desc(attempts.answeredAt),
    // NO LIMIT — user with 10,000 attempts = OOM
  });
  return rows.map(...);
}
```

## Why We Still Need This Method

1. **GDPR Data Export** — User requests "give me all my data"
2. **Account Deletion Verification** — Confirm all user data is gone
3. **Admin/Support Tools** — View full user history for debugging
4. **Future Analytics** — Batch processing of user attempt history

These are legitimate needs. The method shouldn't be removed — it should be made safe.

## The Fix

### 1. Update Port Signature (SPEC-004 + repositories.ts)

```typescript
// BEFORE
findByUserId(userId: string): Promise<readonly Attempt[]>;

// AFTER — require pagination
findByUserId(
  userId: string,
  options: { limit: number; offset: number }
): Promise<readonly Attempt[]>;
```

### 2. Update DrizzleAttemptRepository

```typescript
async findByUserId(
  userId: string,
  options: { limit: number; offset: number }
): Promise<readonly Attempt[]> {
  const limit = Math.max(0, Math.floor(options.limit));
  const offset = Math.max(0, Math.floor(options.offset));
  if (limit === 0) return [];

  const rows = await this.db.query.attempts.findMany({
    where: eq(attempts.userId, userId),
    orderBy: desc(attempts.answeredAt),
    limit,
    offset,
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    questionId: row.questionId,
    practiceSessionId: row.practiceSessionId ?? null,
    selectedChoiceId: this.requireSelectedChoiceId(row),
    isCorrect: row.isCorrect,
    timeSpentSeconds: row.timeSpentSeconds,
    answeredAt: row.answeredAt,
  }));
}
```

### 3. Update FakeAttemptRepository

```typescript
async findByUserId(
  userId: string,
  options: { limit: number; offset: number }
): Promise<readonly Attempt[]> {
  const limit = Math.max(0, Math.floor(options.limit));
  const offset = Math.max(0, Math.floor(options.offset));
  if (limit === 0) return [];

  const userAttempts = this.attempts
    .filter((a) => a.userId === userId)
    .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime());

  return userAttempts.slice(offset, offset + limit);
}
```

### 4. Update SPEC-004

Change the spec to document the paginated signature.

### 5. Update Tests

- `drizzle-attempt-repository.test.ts` — update test to pass options
- `fakes.test.ts` — update FakeAttemptRepository tests

## TDD Order

1. **Write failing test** — call `findByUserId(userId, { limit: 10, offset: 0 })`, expect it to compile and return max 10 results
2. **Update port** — change signature in `repositories.ts`
3. **Update implementation** — add limit/offset to DrizzleAttemptRepository
4. **Update fake** — add limit/offset to FakeAttemptRepository
5. **Verify** — all tests pass, TypeScript compiles

## Verification

- [x] TypeScript compiles with new signature
- [x] All tests pass
- [x] New test verifies pagination works
- [x] SPEC-004 updated to reflect new signature

## Related

- `docs/_archive/bugs/bug-016-memory-exhaustion-power-users.md` — Original memory issue
- `docs/specs/spec-004-application-ports.md` — Port definition to update
- `src/application/ports/repositories.ts:62` — Current port definition
- `src/adapters/repositories/drizzle-attempt-repository.ts:68` — Implementation
- `src/application/test-helpers/fakes.ts:321` — Fake implementation
