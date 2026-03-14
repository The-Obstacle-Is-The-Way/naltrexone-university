# BUG-218: Cached Idempotency Parse Failures Drop Their Original Cause

**Status:** Open
**Priority:** P4 (downgraded from P3 after verification)
**Date:** 2026-03-13

## Summary

`withIdempotency(...)` correctly converts an invalid cached replay into `ApplicationError('INTERNAL_ERROR', 'Cached idempotency result is invalid')`, but it discards the original `parseResult(...)` exception. The verified bug is observability/debugging loss on the replay path, not incorrect user-facing behavior.

## Impact

- When a cached idempotency payload no longer matches the expected schema, the top-level error loses the original parser/Zod failure details.
- This makes cached-payload corruption or schema drift harder to diagnose.
- The user-facing error code/message remain correct, so this is low-risk debugging debt rather than a functional billing/practice failure.

## Verification Notes

1. **The replay catch really drops the cause.** `src/adapters/shared/with-idempotency.ts:146-157` calls `input.parseResult(existing.resultJson)` and, on failure, throws a new `ApplicationError('INTERNAL_ERROR', 'Cached idempotency result is invalid')` with no `{ cause }`.
2. **This only affects cached replay parsing, not the normal execute path.** The same block at `src/adapters/shared/with-idempotency.ts:146-152` only runs after a prior idempotency row already exists and the helper is replaying `existing.resultJson`.
3. **Current tests cover the message but not cause preservation.** `src/adapters/shared/with-idempotency.test.ts:213-255` and `src/adapters/shared/with-idempotency.test.ts:513-555` assert the code/message for cached-null and cached-invalid-payload parse failures, but neither test requires the original parse error to be attached as `error.cause`.
4. **`ApplicationError` already supports causes.** `src/application/errors/application-errors.ts:20-29` accepts an optional `{ cause }`, and `src/application/errors/application-errors.test.ts:40-46` explicitly verifies cause preservation.
5. **Sibling adapters already preserve causes for unexpected infrastructure failures.** `src/adapters/repositories/drizzle-subscription-repository.ts:100-113` wraps unexpected repository failures in `ApplicationError(..., { cause: error })`, so the missing cause here is a real consistency gap.

## Precise TDD Fix

1. Add failing unit tests in `src/adapters/shared/with-idempotency.test.ts` for both cached-null replay failure and cached-invalid-payload failure asserting that the thrown `ApplicationError` preserves the original parse error as `cause`.
2. Update `src/adapters/shared/with-idempotency.ts` to catch the parse failure as `cause` and rethrow `new ApplicationError('INTERNAL_ERROR', 'Cached idempotency result is invalid', undefined, { cause })`.
3. Keep the existing code/message assertions so the fix improves observability without changing the external error contract.
