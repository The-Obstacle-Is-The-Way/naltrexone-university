# DEBT-200: Subscription Repository Upsert Discards Original Error Details

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

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

Include the original error as the `cause`:

```typescript
throw new ApplicationError('INTERNAL_ERROR', 'Failed to upsert subscription', { cause: error });
```

Or, better, log the original error before re-throwing:

```typescript
this.logger.error({ error }, 'Subscription upsert failed');
throw new ApplicationError('INTERNAL_ERROR', 'Failed to upsert subscription');
```

## Verification

- `pnpm typecheck && pnpm test --run`

## Related

- DEBT-194 (console.error defaults — related error handling patterns)
