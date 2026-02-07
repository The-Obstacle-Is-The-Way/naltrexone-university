# DEBT-127: Missing Index on practice_sessions (userId, endedAt)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

`DrizzlePracticeSessionRepository.findLatestIncompleteByUserId()` queries for sessions where `endedAt IS NULL` filtered by `userId`. The table has an index on `(userId, startedAt DESC)` but none covering `endedAt`. As sessions accumulate, this degrades because Postgres must scan all user sessions.

## Impact

- Query performance degrades linearly with session count per user
- Power users with 100+ sessions will experience slower practice page loads
- Currently mitigated by low user count

## Affected File

`db/schema.ts:327-332` — Missing index definition

## Resolution

Add composite index and generate migration:

```typescript
userEndedAtIdx: index('practice_sessions_user_ended_at_idx').on(
  t.userId,
  t.endedAt,
),
```

**Requires:** `pnpm db:generate` + `pnpm db:migrate`

## Verification

- [ ] Migration generated and applied
- [ ] `EXPLAIN ANALYZE` shows index scan
- [ ] All existing tests pass

## Related

- `src/adapters/repositories/drizzle-practice-session-repository.ts`
