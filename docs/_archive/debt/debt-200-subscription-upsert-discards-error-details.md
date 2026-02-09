# DEBT-200: Subscription Repository Upsert Discards Original Error Details

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-09

---

## Description

The `DrizzleSubscriptionRepository.upsert` method catches non-unique-violation errors and re-throws them as a generic `ApplicationError('INTERNAL_ERROR', 'Failed to upsert subscription')` without including the original error as a cause.

## Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `src/adapters/repositories/drizzle-subscription-repository.ts` | 106-110 | Original error details discarded |

## Current Code

```typescript
} catch (error) {
  if (isUniqueViolation(error)) { ... }
  throw new ApplicationError('INTERNAL_ERROR', 'Failed to upsert subscription');
  // Original `error` is lost — no `{ cause: error }`
}
```

## Impact

- Connection failures, serialization errors, and other database issues lose their diagnostic information
- Operators must correlate timestamps across application logs and database logs to diagnose issues
- Compare with `DrizzleUserRepository.mapDbError` which preserves error classification

## Resolution

Preserve the original error as the `cause` on the thrown `ApplicationError`.

This repo's `ApplicationError` previously only supported `fieldErrors`. The fix
adds an optional `cause` to `ApplicationError` while keeping the existing
constructor signature compatible (fieldErrors remains the third parameter).

```typescript
throw new ApplicationError(
  'INTERNAL_ERROR',
  'Failed to upsert subscription',
  undefined,
  { cause: error },
);
```

This preserves diagnostic context for operators without changing the outward
error contract.

## Verification

- [x] `pnpm typecheck && pnpm test --run`
- [x] Repository regression test asserts `ApplicationError.cause` is the original DB error
- [x] `ApplicationError` unit test asserts cause is preserved

## Related

- DEBT-194 (console.error defaults — related error handling patterns)
