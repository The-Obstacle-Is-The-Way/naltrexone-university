# BUG-211: `row?.count ?? 0` Fallback Silently Masks Query Failures

**Status:** Invalidated (false positive)
**Priority:** ~~P2~~ N/A
**Date:** 2026-03-13

## Summary

Three locations use `row?.count ?? 0` after `SELECT count(*)` queries.

## Invalidation Reason

**Tracer-bullet verification confirmed `count(*)` without GROUP BY always returns exactly one row in PostgreSQL.**

All three queries use the pattern:
```typescript
const [row] = await this.db
  .select({ count: sql<number>`count(*)::int` })
  .from(tableName)
  .where(conditions);
```

PostgreSQL's `count(*)` without GROUP BY is an aggregate that **always** produces a single result row, even when no rows match the WHERE clause (returning `{ count: 0 }`). The `row` from destructuring `const [row] = await query` can never be `undefined`.

If the database connection fails or the query errors, Drizzle throws an exception (does not return an empty array). The `?? 0` fallback can never execute.

**Conclusion:** The `?? 0` is harmless dead defensive code, not a bug that masks failures. No action needed.
