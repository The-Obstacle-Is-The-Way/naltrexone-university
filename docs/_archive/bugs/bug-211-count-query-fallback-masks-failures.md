# BUG-211: `row?.count ?? 0` Fallback Silently Masks Query Failures

**Status:** Invalidated (false positive)
**Priority:** ~~P2~~ N/A
**Date:** 2026-03-13

## Summary

There are **four** `row?.count ?? 0` call sites across three repositories, but none can actually mask a real database failure because every underlying SQL statement is a count aggregate without `GROUP BY`.

## Invalidation Reason

**Tracer-bullet verification confirmed these count aggregates always return exactly one row in PostgreSQL when the query succeeds, and throw when the query fails.**

Verified call sites:

- `src/adapters/repositories/drizzle-question-repository.ts:177-192` uses `count(distinct ${questions.id})::int`
- `src/adapters/repositories/drizzle-practice-session-repository.ts:123-129` uses `count(*)::int`
- `src/adapters/repositories/drizzle-attempt-repository.ts:328-337` uses `count(*)::int`
- `src/adapters/repositories/drizzle-attempt-repository.ts:465-495` uses `count(distinct ${latestAttemptRows.questionId})::int`

None of those queries has a `GROUP BY`. In PostgreSQL, an aggregate query without `GROUP BY` returns a single row even when no underlying rows match the predicate, with the aggregate value set to `0`.

That means the destructured `row` from `const [row] = await query` cannot be `undefined` in real execution for these queries. If the database fails instead, Drizzle throws; it does not convert a failed aggregate query into `[]`.

The existing tests also model this as a normal count row, not as a masked failure:

- `src/adapters/repositories/drizzle-question-repository.test.ts:322-348` and `393-419`
- `src/adapters/repositories/drizzle-practice-session-repository.test.ts:127-145` and `174-204`
- `src/adapters/repositories/drizzle-attempt-repository.test.ts:493-526` and `762-809`

## Conclusion

The `?? 0` is harmless dead defensive code. It can be removed for clarity if desired, but it is **not** a bug and it does **not** mask runtime query failures.
