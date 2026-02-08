# DEBT-171: Drizzle Subscription Repository and Postgres Error Helpers Missing Tests

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Two adapter-layer modules with significant logic have zero test coverage:

### 1. `drizzle-subscription-repository.ts` (113 lines)

The `DrizzleSubscriptionRepository` implements `SubscriptionRepository` with three methods:

- **`toDomain(row)`** — Maps database rows to domain `Subscription` entities. Calls `getSubscriptionPlanFromPriceId()` which can throw `ApplicationError('INTERNAL_ERROR')` for unknown Stripe price IDs. Also calls `stripeSubscriptionStatusToSubscriptionStatus()` for status mapping.
- **`findByUserId(userId)`** — Queries by user ID, returns domain entity or null
- **`findByExternalSubscriptionId(externalSubscriptionId)`** — Queries by Stripe subscription ID
- **`upsert(input)`** — Inserts or updates with `onConflictDoUpdate` on `userId`. Catches postgres unique violations and maps them to `ApplicationError('CONFLICT')`. All other errors become `ApplicationError('INTERNAL_ERROR')`.

**Untested behaviors:**
- `toDomain()` throwing when `getSubscriptionPlanFromPriceId()` returns null (unknown price ID)
- `upsert()` catching unique violation (code `23505`) and mapping to `CONFLICT`
- `upsert()` catching non-unique-violation errors and mapping to `INTERNAL_ERROR`
- Correct field mapping from database row to domain entity
- `findByUserId` / `findByExternalSubscriptionId` returning null for missing rows

### 2. `postgres-errors.ts` (41 lines)

Three utility functions for postgres error introspection:

- **`getPostgresErrorCode(error)`** — Extracts error code from `error.code` or `error.cause.code` (Drizzle wraps postgres errors in a `cause` property)
- **`getPostgresConstraintName(error)`** — Extracts constraint name from `error.constraint` or `error.cause.constraint`
- **`isPostgresUniqueViolation(error)`** — Checks if error code is `'23505'`

**Untested behaviors:**
- Direct `error.code` extraction (flat error object)
- Nested `error.cause.code` extraction (Drizzle-wrapped error)
- Null/undefined/non-object input handling
- `error.cause` being null/undefined/non-object
- Constraint name extraction with same nesting patterns
- `isPostgresUniqueViolation` returning true for `23505` and false for other codes

## Impact

- **`postgres-errors.ts` is used by multiple repositories** — `DrizzleSubscriptionRepository`, `DrizzleAttemptRepository`, and potentially others. A regression here silently breaks unique violation detection across the system.
- **`DrizzleSubscriptionRepository` handles billing data** — incorrect domain mapping could lead to wrong subscription plans displayed to users, or wrong status checks for entitlement.
- **Drizzle error wrapping may change** — if a Drizzle ORM upgrade changes how errors are wrapped (e.g., no longer using `cause`), `postgres-errors.ts` would silently break without test coverage to catch it.
- **Inconsistent with project standards** — all other Drizzle repositories have test files (`drizzle-attempt-repository.test.ts`, `drizzle-practice-session-repository.test.ts`, `drizzle-idempotency-key-repository.test.ts`, etc.)

## Resolution

### 1. Create `postgres-errors.test.ts`

```
Tests for:
- getPostgresErrorCode with direct error.code
- getPostgresErrorCode with nested error.cause.code
- getPostgresErrorCode with null/undefined/non-object input
- getPostgresErrorCode with error.cause being null
- getPostgresConstraintName — same patterns
- isPostgresUniqueViolation — true for 23505, false for others
```

### 2. Create `drizzle-subscription-repository.test.ts`

Use `vi.fn()` mocks for the Drizzle `db` parameter (this is an external dependency, so mocking is appropriate per project conventions):

```
Tests for:
- findByUserId returns domain entity for existing row
- findByUserId returns null for missing row
- findByExternalSubscriptionId — same patterns
- upsert success path
- upsert catches unique violation → throws CONFLICT
- upsert catches other errors → throws INTERNAL_ERROR
- toDomain throws INTERNAL_ERROR for unknown price ID
- toDomain correctly maps all fields
```

## Verification

- [x] `postgres-errors.test.ts` covers direct/nested code extraction and constraint-name extraction paths
- [x] `drizzle-subscription-repository.test.ts` covers not-found + full field mapping + error mapping paths
- [x] Unique-violation and non-unique error mappings are asserted
- [x] `pnpm test --run` passes
- [x] `pnpm typecheck` passes

## Related

- `src/adapters/repositories/drizzle-subscription-repository.ts`
- `src/adapters/repositories/postgres-errors.ts`
- `src/adapters/config/stripe-prices.ts` — `getSubscriptionPlanFromPriceId()`
- DEBT-169 — shared application utilities also missing tests
