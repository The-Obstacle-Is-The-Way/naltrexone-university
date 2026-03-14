# BUG-206: Raw DB Errors Escape Adapter Layer via `throw error` Fallback

**Status:** Open
**Priority:** P3
**Date:** 2026-03-13

## Summary

`DrizzlePracticeSessionRepository.create()` and `DrizzleAttemptRepository.insert()` do re-throw non-targeted insert failures raw after handling their expected uniqueness conflicts.

## Verification Notes

Tracer-bullet verification confirmed two different facts, and the distinction matters:

1. **The repository bug is real:** `DrizzlePracticeSessionRepository.create()` rethrows unknown insert errors at `src/adapters/repositories/drizzle-practice-session-repository.ts:171-191`, and `DrizzleAttemptRepository.insert()` rethrows unknown insert errors at `src/adapters/repositories/drizzle-attempt-repository.ts:187-213`.
2. **The current test suite locks in the raw passthrough:** `src/adapters/repositories/drizzle-attempt-repository.test.ts:303-320` includes `it('rethrows unique violations from other constraints', ...)`.
3. **The current server-action boundary sanitizes later:** the current user-facing `startPracticeSession` and `submitAnswer` paths do run through `createAction(...)`, so `src/adapters/controllers/create-action.ts:40-48` and `src/adapters/controllers/action-result.ts:38-61` eventually normalize those unknown throws into `INTERNAL_ERROR` for action callers.

That second fact does **not** invalidate the first. The bug is not "raw DB errors reach the client." The bug is that raw infrastructure errors cross the repository adapter boundary into application/use-case code before the controller safety net runs.

## Impact

- Application-layer callers receive driver- or Postgres-shaped errors instead of `ApplicationError`.
- Behavior is inconsistent across entry points: controller-backed calls are sanitized later, while direct callers can still observe raw DB errors.
- The repository contract is weaker than sibling adapters such as `DrizzleUserRepository` (`src/adapters/repositories/drizzle-user-repository.ts:130-135`), `DrizzleStripeCustomerRepository` (`src/adapters/repositories/drizzle-stripe-customer-repository.ts:64-80`), and `DrizzleSubscriptionRepository` (`src/adapters/repositories/drizzle-subscription-repository.ts:100-108`), which already wrap unexpected DB failures as `ApplicationError`.

## Precise TDD Fix

1. Add a failing unit test in `src/adapters/repositories/drizzle-practice-session-repository.test.ts` proving that unexpected insert failures from `create()` are wrapped in `ApplicationError('INTERNAL_ERROR', 'Failed to create practice session', ..., { cause })`.
2. Change `DrizzlePracticeSessionRepository.create()` to wrap non-targeted DB failures in `ApplicationError`, preserving the original error as `cause`.
3. Change `DrizzleAttemptRepository.insert()` to do the same:
   - keep `ATTEMPTS_SESSION_QUESTION_UQ` mapped to `CONFLICT`
   - wrap every other DB failure in `ApplicationError('INTERNAL_ERROR', 'Failed to insert attempt', ..., { cause })`
4. Update `src/adapters/repositories/drizzle-attempt-repository.test.ts` so the current raw-passthrough test asserts the wrapped `ApplicationError` behavior instead.
