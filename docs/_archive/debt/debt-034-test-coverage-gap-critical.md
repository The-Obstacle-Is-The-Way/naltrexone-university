# DEBT-034: Test Coverage Gap — Must Stabilize Before New Features

**Status:** Resolved
**Priority:** P0 → **P1** (downgraded - critical gaps fixed)
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Summary

The codebase had spec implementations that outpaced test coverage. We've made significant progress fixing this.

## Current State (Updated 2026-02-01)

### Coverage by Layer

| Layer | Source | Tests | Coverage | Status |
|-------|--------|-------|----------|--------|
| Domain Services | 6 | 5 | 83% | ✅ Good |
| Value Objects | 7 | 7 | **100%** | ✅ Complete |
| Use Cases | 3 | 3 | **100%** | ✅ Complete |
| Repositories | 9 | 9 | **100%** | ✅ Complete |
| Gateways | 2 | 2 | **100%** | ✅ Complete |
| Config | 1 | 1 | **100%** | ✅ Complete |

### Repositories Status

| Repository | Unit Test | Integration Test |
|------------|-----------|------------------|
| drizzle-attempt-repository | ✅ Yes | ✅ Yes |
| drizzle-bookmark-repository | ✅ Yes | ✅ Yes |
| drizzle-practice-session-repository | ✅ Yes | ✅ Yes |
| drizzle-question-repository | ✅ Yes | ✅ Yes |
| drizzle-stripe-customer-repository | ✅ Yes | ✅ Yes |
| drizzle-stripe-event-repository | ✅ Yes | ✅ Yes |
| drizzle-subscription-repository | ✅ Yes | ✅ Yes |
| drizzle-tag-repository | ✅ Yes | ✅ Yes |
| drizzle-user-repository | ✅ Yes | ✅ Yes |

## What Was Fixed (Session 2026-02-01)

- [x] `drizzle-stripe-event-repository.test.ts` (DEBT-025 - archived)
- [x] `stripe-prices.test.ts` (DEBT-029 - archived)
- [x] `drizzle-tag-repository.test.ts` (DEBT-030 - archived)
- [x] `drizzle-user-repository.test.ts` (DEBT-028 - archived)
- [x] `drizzle-attempt-repository.test.ts`
- [x] `drizzle-bookmark-repository.test.ts`
- [x] `drizzle-question-repository.test.ts`
- [x] Time injection tests for all repositories using `now` dependency
- [x] Removed vi.mock-based auth/container tests; replaced with DI-based container tests
- [x] Clarified fakes vs mocks conventions in CLAUDE.md, AGENTS.md, PROMPT.md
- [x] Coverage reporting in CI (unit + integration coverage)

## What's Still Missing

None. Repository unit test coverage is now complete.

## Resolution

Added missing repository unit tests to complete adapter coverage. Stripe/payment
paths and existing integration coverage remain intact.

## Acceptance Criteria

- [x] All payment-critical code tested (Stripe event repo, prices config)
- [x] All gateways tested
- [x] All repositories have unit tests

## Related (Archived)

- ~~DEBT-025~~: Untested Stripe Event Repository → **Resolved**
- ~~DEBT-029~~: Untested Stripe Prices Config → **Resolved**
- ~~DEBT-030~~: Untested Tag Repository → **Resolved**
- ~~DEBT-035~~: Inconsistent Repo Test Mocking → **Resolved (false positive)**
