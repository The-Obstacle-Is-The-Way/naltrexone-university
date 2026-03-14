# BUG-206: Raw DB Errors Escape Adapter Layer via `throw error` Fallback

**Status:** Resolved
**Priority:** P3
**Date:** 2026-03-13

## Summary

`DrizzlePracticeSessionRepository.create()` and `DrizzleAttemptRepository.insert()` used to re-throw non-targeted insert failures raw after handling their expected uniqueness conflicts. This is now fixed.

## Implemented Fix

1. **`DrizzlePracticeSessionRepository.create()`** now wraps non-targeted DB errors in `ApplicationError('INTERNAL_ERROR', 'Failed to create practice session', undefined, { cause: error })` at `src/adapters/repositories/drizzle-practice-session-repository.ts:191-196`, matching the pattern already used by `DrizzleSubscriptionRepository`, `DrizzleUserRepository`, and `DrizzleStripeCustomerRepository`.
2. **`DrizzleAttemptRepository.insert()`** now wraps non-targeted DB errors in `ApplicationError('INTERNAL_ERROR', 'Failed to insert attempt', undefined, { cause: error })` at `src/adapters/repositories/drizzle-attempt-repository.ts:213-218`, while preserving the existing `ATTEMPTS_SESSION_QUESTION_UQ` → `CONFLICT` mapping.

## Verification Notes

1. `src/adapters/repositories/drizzle-practice-session-repository.test.ts:573` — new test proves unexpected insert failures are wrapped in `ApplicationError('INTERNAL_ERROR')` with `{ cause }`.
2. `src/adapters/repositories/drizzle-attempt-repository.test.ts:303` — existing raw-passthrough test updated to assert `ApplicationError` wrapping with `{ cause }` for non-targeted unique violations.
3. `src/adapters/repositories/drizzle-attempt-repository.test.ts:322` — new test proves generic DB errors (non-constraint) are also wrapped with `{ cause }`.
4. Full suite: 1991 tests across 251 files, all green. Typecheck and lint clean.

## Outcome

All repository adapters now consistently wrap unexpected DB errors in `ApplicationError` at the adapter boundary. Application-layer callers no longer observe raw Postgres/Drizzle errors regardless of entry point.
