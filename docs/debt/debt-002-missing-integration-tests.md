# DEBT-002: Missing Integration Tests for Repositories

**Status:** Resolved
**Priority:** P2
**Date:** 2026-01-31
**Resolved:** 2026-02-01

## Summary

Repository implementations needed integration tests against a real Postgres database to validate behavior we cannot reliably prove with fakes alone:

- Constraint violations and uniqueness behavior
- NULL handling edge cases
- Transaction/consistency behavior

## Resolution

Integration tests now exist and run against a real Postgres instance (service container in CI):

- `tests/integration/db.integration.test.ts` (migrations sanity: tables + `pgcrypto`)
- `tests/integration/repositories.integration.test.ts` (repository behavior)

Repositories covered:

- `DrizzleAttemptRepository`
- `DrizzleBookmarkRepository`
- `DrizzlePracticeSessionRepository`
- `DrizzleQuestionRepository`
- `DrizzleStripeCustomerRepository`
- `DrizzleStripeEventRepository`
- `DrizzleSubscriptionRepository`
- `DrizzleTagRepository`

Safety guard:

- Integration tests refuse to run against a non-local `DATABASE_URL` unless `ALLOW_NON_LOCAL_DATABASE_URL=true`.

## Acceptance Criteria

- Integration tests exist for all repository implementations ✅
- Tests run in CI with a Postgres service container ✅
- Tests refuse to run against a non-local `DATABASE_URL` by default ✅
