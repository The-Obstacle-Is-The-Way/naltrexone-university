# DEBT-040: Missing Standalone Index on Attempts by Session

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

The `attempts` table has a composite index on `(practiceSessionId, desc(answeredAt))`:

```typescript
// db/schema.ts:324-327
sessionAnsweredAtIdx: index('attempts_session_answered_at_idx').on(
  t.practiceSessionId,
  desc(t.answeredAt),
),
```

However, the `findBySessionId()` repository method filters by both `practiceSessionId` AND `userId`:

```typescript
// drizzle-attempt-repository.ts:88-95
where: and(
  eq(attempts.practiceSessionId, sessionId),
  eq(attempts.userId, userId),
),
```

This query might not efficiently use the existing index because:
1. The composite index includes `answeredAt` ordering which may not be needed for all queries
2. The query planner might choose the `userId`-based index instead if it estimates fewer rows

## Impact

- **Suboptimal query performance:** The planner may choose a less efficient index or scan
- **Scalability concern:** As `attempts` table grows, inefficient queries become problematic
- **Hidden cost:** Performance degradation won't be obvious until data volume increases

## Location

- `db/schema.ts` - Attempts table indexes
- `src/adapters/repositories/drizzle-attempt-repository.ts:88-95` - `findBySessionId()` method

## Resolution

Consider adding a standalone index on just `practiceSessionId`:

```typescript
practiceSessionIdIdx: index('attempts_practice_session_id_idx').on(
  t.practiceSessionId
),
```

Or a composite index matching the query pattern:

```typescript
sessionUserIdx: index('attempts_session_user_idx').on(
  t.practiceSessionId,
  t.userId
),
```

Before implementing, run `EXPLAIN ANALYZE` on production-like data to verify the issue.

## Verification

- [ ] Profile current query performance with `EXPLAIN ANALYZE`
- [ ] Add appropriate index if performance is suboptimal
- [ ] Re-run `EXPLAIN ANALYZE` to confirm improvement
- [ ] Generate and apply migration

## Related

- ADR-006 (Database Design) if applicable
- `tests/integration/*.integration.test.ts` - Can add performance assertions
