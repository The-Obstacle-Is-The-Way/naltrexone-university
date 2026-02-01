# DEBT-020: Duplicated Postgres Unique-Violation Detection Helper

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

We have duplicated, slightly ad-hoc Postgres “unique violation” detection logic (`code === '23505'`, including nested `cause.code`) in multiple adapters.

This is not currently breaking anything, but it is classic DRY drift: future improvements (supporting other error shapes, logging richer context) must be made in multiple places and will likely diverge.

## Locations

- `src/adapters/repositories/drizzle-stripe-customer-repository.ts` (`isPostgresUniqueViolation`)
- `src/adapters/repositories/drizzle-subscription-repository.ts` (`isPostgresUniqueViolation`)
- Similar-but-not-identical logic exists in `src/adapters/gateways/clerk-auth-gateway.ts` (`mapDbError`)

## Proposed Fix

Extract a shared helper in adapters (not domain/application), e.g.:

```ts
// src/adapters/repositories/postgres-errors.ts
export function getPostgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const code = (cause as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505';
}
```

Then re-use in all adapters that need Postgres error mapping.

Resolved via:

- Added `src/adapters/repositories/postgres-errors.ts` + unit tests.
- Refactored Stripe customer/subscription repositories and Clerk auth gateway to use the shared helper.

## Acceptance Criteria

- Single canonical implementation of Postgres error-code extraction in adapters.
- All repositories/gateways use it consistently.
- Unit tests cover the helper against expected error shapes.
