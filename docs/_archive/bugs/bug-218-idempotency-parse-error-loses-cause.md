# BUG-218: Cached Idempotency Parse Failures Drop Their Original Cause

**Status:** Resolved
**Priority:** P4 (downgraded from P3 after verification)
**Date:** 2026-03-13

## Summary

`withIdempotency(...)` used to discard the original `parseResult(...)` exception when converting an invalid cached replay into `ApplicationError('INTERNAL_ERROR', 'Cached idempotency result is invalid')`. This is now fixed.

## Implemented Fix

1. **`with-idempotency.ts:153`** now catches the parse exception as `cause` and passes it through `new ApplicationError('INTERNAL_ERROR', 'Cached idempotency result is invalid', undefined, { cause })`. The external error code/message are unchanged.

## Verification Notes

1. `src/adapters/shared/with-idempotency.test.ts:229` — cached-null replay failure now asserts `instanceof ApplicationError` and `error.cause === parseError` (identity check).
2. `src/adapters/shared/with-idempotency.test.ts:531` — cached-invalid-payload replay failure asserts the same cause preservation.
3. Full suite: 1991 tests across 251 files, all green. Typecheck and lint clean.

## Outcome

Cached idempotency replay parse failures now preserve the original parser/Zod exception as `cause`, making schema drift and payload corruption diagnosable without changing the external error contract.
