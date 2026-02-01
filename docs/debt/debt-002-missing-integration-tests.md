# DEBT-002: Missing Integration Tests for Repositories

**Status:** Open
**Priority:** P2
**Date:** 2026-01-31

## Summary

Several repository implementations lack integration tests against a real Postgres database. Unit tests with fakes exist, but integration tests are needed to validate:

- Zod schema validation against real data
- NULL handling edge cases
- Constraint violations
- Transaction behavior

## Missing Tests

| Repository | Integration Test | Status |
|-----------|------------------|--------|
| DrizzleAttemptRepository | Missing | ❌ |
| DrizzlePracticeSessionRepository | Missing | ❌ |
| DrizzleStripeCustomerRepository | Missing | ❌ |
| DrizzleQuestionRepository | Exists | ✅ |
| DrizzleSubscriptionRepository | Exists | ✅ |
| DrizzleTagRepository | Exists | ✅ |

## Specific Gaps

### PracticeSessionRepository
- Zod validation never tested against real data:
  - `count: z.number().int().min(1).max(200)` - boundary testing
  - `tagSlugs: z.array(z.string().min(1)).max(50)` - empty slug validation
  - `difficulties: z.array(questionDifficultySchema).max(3)` - enum validation
  - `.strict()` mode - extra fields rejection

### AttemptRepository
- NULL value handling for `selectedChoiceId` (null = skipped)
- Timestamp precision
- Foreign key constraint behavior

### StripeCustomerRepository
- Upsert behavior (create vs update)
- Unique constraint on stripeCustomerId

## Acceptance Criteria

- Integration tests exist for all repository implementations
- Boundary conditions tested (min/max values)
- NULL handling explicitly tested
- Tests run in CI with service container
