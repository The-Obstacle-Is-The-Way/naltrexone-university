# BUG-218: `withIdempotency` Discards Original Parse Error Context

**Status:** Open
**Priority:** P3
**Date:** 2026-03-13

## Summary

In `with-idempotency.ts:153`, when `parseResult` throws (e.g., cached result doesn't match expected schema), the catch block throws a new `ApplicationError('INTERNAL_ERROR', 'Cached idempotency result is invalid')` without preserving the original error as `cause`. The original parse error (which contains schema mismatch details) is lost.

## Impact

- Debugging idempotency cache corruption is harder because the specific schema mismatch details are discarded.
- The pattern is inconsistent with other error-wrapping in the codebase which preserves `{ cause: error }`.

## Location

- `src/adapters/shared/with-idempotency.ts:153`

## Suggested Fix

```typescript
} catch (cause) {
  throw new ApplicationError('INTERNAL_ERROR', 'Cached idempotency result is invalid', { cause });
}
```
