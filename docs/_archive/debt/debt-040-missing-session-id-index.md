# DEBT-040: Missing Standalone Index on Attempts by Session

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-02

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

This was **premature optimization**.

We already have an index that starts with `practiceSessionId` and matches the query's ordering:

- `attempts_session_answered_at_idx` on `(practiceSessionId, desc(answeredAt))`

Also, practice sessions are bounded (`MAX_PRACTICE_SESSION_QUESTIONS = 200`), so `findBySessionId()` is expected to return a small result set per session. Adding another index would increase write-amplification on every attempt insert with no demonstrated production benefit.

If this ever becomes a real bottleneck, we should revisit with `EXPLAIN (ANALYZE, BUFFERS)` on production-like data and consider an index that matches the final query shape.

## Verification

- [x] Verified existing index covers `(practiceSessionId, desc(answeredAt))`
- [x] Verified per-session attempt count is bounded (max questions per session)
- [x] Chose not to add an index without evidence
- [x] Existing tests pass

## Related

- ADR-006 (Database Design) if applicable
- `tests/integration/*.integration.test.ts` - Can add performance assertions
