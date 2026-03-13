# BUG-206: Raw DB Errors Escape Adapter Layer via `throw error` Fallback

**Status:** Open
**Priority:** P1
**Date:** 2026-03-13

## Summary

In `drizzle-practice-session-repository.ts:191` and `drizzle-attempt-repository.ts:213`, catch blocks check for a specific Postgres unique-violation constraint and re-throw all other errors raw. This means any non-unique-violation database error (connection timeout, syntax error, relation-not-found) propagates as a raw Drizzle/pg driver error instead of being wrapped in `ApplicationError`.

## Impact

- Breaks the Clean Architecture contract that adapters translate infrastructure errors into domain errors.
- Callers (use cases, controllers) cannot reliably match on `ApplicationError` codes for these failures.
- Raw driver errors may leak Postgres internals (table names, constraint names, query fragments) into error responses or logs at incorrect abstraction levels.

## Locations

- `src/adapters/repositories/drizzle-practice-session-repository.ts:191` -- `throw error` after unique-violation check in `create()`
- `src/adapters/repositories/drizzle-attempt-repository.ts:213` -- `throw error` after unique-violation check in `insert()`

## Repro

1. Trigger any non-unique-violation Postgres error during session creation or attempt insertion (e.g., connection timeout, killed connection).
2. Observe raw `NeonDbError` or `PostgresError` propagating up the call stack instead of `ApplicationError('INTERNAL_ERROR', ...)`.

## Suggested Fix

Wrap the fallback `throw error` in both locations:

```typescript
throw new ApplicationError('INTERNAL_ERROR', 'Database operation failed', { cause: error });
```

This matches the pattern already used in `drizzle-subscription-repository.ts:108` and `drizzle-user-repository.ts:132`.

## Prevention

- Add a lint rule or code review checklist item: "All catch blocks in adapter repositories must wrap unknown errors in `ApplicationError`."
