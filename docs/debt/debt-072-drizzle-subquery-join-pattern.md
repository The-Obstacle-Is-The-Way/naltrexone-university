# DEBT-072: Drizzle Subquery Join Pattern Causes Ambiguous Columns

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

When using Drizzle ORM's subquery `.as()` with joins, the generated SQL doesn't properly qualify column references, causing PostgreSQL "ambiguous column" errors at runtime.

This is a dangerous pattern because:
1. TypeScript compiles without errors
2. Unit tests with mocks pass
3. Only fails at runtime with real PostgreSQL

## Example (BUG-046)

```typescript
// This compiles and type-checks but generates broken SQL
const latestAttemptByQuestion = this.db
  .select({
    questionId: attempts.questionId,
    answeredAt: max(attempts.answeredAt).as('answered_at'),  // Aliased
  })
  .from(attempts)
  .where(eq(attempts.userId, userId))
  .groupBy(attempts.questionId)
  .as('latest_attempt_by_question');

const rows = await this.db
  .select({ ... })
  .from(latestAttemptByQuestion)
  .innerJoin(
    attempts,
    and(
      // ...
      eq(attempts.answeredAt, latestAttemptByQuestion.answeredAt),  // AMBIGUOUS!
    ),
  );
```

Generated SQL has unqualified `answered_at`:
```sql
... inner join "attempts" on (...
  and "attempts"."answered_at" = "answered_at")  -- Not qualified!
```

## Impact

- Runtime errors that slip past type checking and unit tests
- Only caught by integration tests or production usage
- May affect other queries using similar patterns

## Resolution

1. **Audit existing queries** — Search for `.as('...')` with joins
2. **Use unique aliases** — Avoid column names that exist in joined tables
3. **Consider raw SQL** — For complex queries, use `sql` template tag with explicit qualification
4. **Add integration tests** — Every repository method with joins needs integration test coverage

## Verification

- [ ] All `.as()` aliases are unique and don't collide with joined table columns
- [ ] Integration tests cover all subquery join patterns
- [ ] BUG-046 fixed

## Related

- BUG-046: Review Page SQL Error — Ambiguous Column Reference
- `src/adapters/repositories/drizzle-attempt-repository.ts`
- Drizzle ORM GitHub issues (may be known limitation)
