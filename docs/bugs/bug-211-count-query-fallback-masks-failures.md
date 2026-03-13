# BUG-211: `row?.count ?? 0` Fallback Silently Masks Query Failures

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

Three locations in the adapter repositories use `row?.count ?? 0` to extract a count from a `SELECT count(*)` query. A `count(*)` query always returns exactly one row (even when counting zero records, the result is `{ count: 0 }`, not `undefined`). If `row` is `undefined`, it means the query itself failed or returned an unexpected empty result set -- a condition that should be surfaced as an error, not silently reported as "0 results."

## Impact

- A broken query (e.g., connection drop mid-query, query timeout) would report "0 questions" or "0 attempts" instead of raising an error.
- Users would see incorrect zero-count statistics with no indication of a problem.
- Monitoring systems would not be alerted because no error is thrown.

## Locations

- `src/adapters/repositories/drizzle-question-repository.ts:192` -- `return row?.count ?? 0;`
- `src/adapters/repositories/drizzle-attempt-repository.ts:337` -- `return row?.count ?? 0;`
- `src/adapters/repositories/drizzle-attempt-repository.ts:495` -- `return row?.count ?? 0;`

## Suggested Fix

Replace the fallback with an explicit check:

```typescript
const [row] = await query;
if (row === undefined) {
  throw new ApplicationError('INTERNAL_ERROR', 'Count query returned no rows');
}
return row.count;
```

## Prevention

- Avoid `?? 0` on database count queries. Treat missing rows as errors, not defaults.
