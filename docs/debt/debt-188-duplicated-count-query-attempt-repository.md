# DEBT-188: Duplicated Count Query Pattern in Attempt Repository

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

---

## Description

`DrizzleAttemptRepository` has five nearly identical count methods that all use `sql<number>\`count(*)::int\`` with minor WHERE clause variations:

| Method | Line | WHERE Difference |
|--------|------|------------------|
| `countByUserId()` | 184 | `userId` only |
| `countCorrectByUserId()` | 193 | `userId` + `isCorrect=true` |
| `countByUserIdSince()` | 202 | `userId` + `answeredAt >= since` |
| `countCorrectByUserIdSince()` | 214 | `userId` + `isCorrect=true` + `answeredAt >= since` |
| (unnamed count in missed query) | 318 | Different context |

### File

`src/adapters/repositories/drizzle-attempt-repository.ts:184-225`

## Impact

- Any change to the count pattern requires updating 4+ methods
- Each method is ~8 lines of boilerplate differing only in the WHERE clause
- Minor maintenance burden

## Resolution

Extract a private helper:

```typescript
private async countWhere(userId: string, ...conditions: SQL[]): Promise<number> {
  const [row] = await this.db
    .select({ count: sql<number>`count(*)::int` })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), ...conditions));
  return row?.count ?? 0;
}
```

Then each method becomes a one-liner.

## Verification

- [ ] All count methods delegate to shared helper
- [ ] Existing tests pass unchanged
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes
