# DEBT-034: Test Coverage Gap — Must Stabilize Before New Features

**Status:** Open (Partially Resolved)
**Priority:** P0 → **P1** (downgraded - critical gaps fixed)
**Date:** 2026-02-01
**Updated:** 2026-02-01

---

## Summary

The codebase had spec implementations that outpaced test coverage. We've made significant progress fixing this.

## Current State (Updated 2026-02-01)

### Test Count: 195 passing

### Coverage by Layer

| Layer | Source | Tests | Coverage | Status |
|-------|--------|-------|----------|--------|
| Domain Services | 6 | 5 | 83% | ✅ Good |
| Value Objects | 7 | 7 | **100%** | ✅ Complete |
| Use Cases | 3 | 3 | **100%** | ✅ Complete |
| Repositories | 9 | 6 | **67%** | 🔶 3 missing |
| Gateways | 2 | 2 | **100%** | ✅ Complete |
| Config | 1 | 1 | **100%** | ✅ Complete |

### Repositories Status

| Repository | Unit Test | Integration Test |
|------------|-----------|------------------|
| drizzle-attempt-repository | ❌ Missing | ✅ Yes |
| drizzle-bookmark-repository | ❌ Missing | ✅ Yes |
| drizzle-practice-session-repository | ✅ Yes | ✅ Yes |
| drizzle-question-repository | ❌ Missing | ✅ Yes |
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
- [x] Time injection tests for all repositories using `now` dependency
- [x] Deleted redundant `lib/auth.test.ts` and `lib/container.test.ts` (vi.mock anti-pattern)
- [x] Clarified fakes vs mocks conventions in CLAUDE.md, AGENTS.md, PROMPT.md

## What's Still Missing

### P1 - Repository Unit Tests (3 remaining)

These repositories have integration tests but no unit tests:

1. **drizzle-attempt-repository.ts** - Core practice flow
2. **drizzle-bookmark-repository.ts** - User bookmarks
3. **drizzle-question-repository.ts** - Content serving

**Note:** Integration tests exist in `tests/integration/repositories.integration.test.ts` and cover these, so the risk is lower than initially assessed.

### P2 - Nice to Have

- [ ] Expand E2E tests beyond smoke + dark mode
- [ ] Coverage reporting in CI

## Resolution

The 3 missing repository unit tests can be added incrementally. They're P1, not P0, because:
1. Integration tests already cover the functionality
2. The critical payment path (Stripe) is fully tested
3. No active bugs in these areas

## Acceptance Criteria

- [x] All payment-critical code tested (Stripe event repo, prices config)
- [x] All gateways tested
- [ ] All repositories have unit tests (3 remaining)
- [ ] E2E covers critical user flows

## Related (Archived)

- ~~DEBT-025~~: Untested Stripe Event Repository → **Resolved**
- ~~DEBT-029~~: Untested Stripe Prices Config → **Resolved**
- ~~DEBT-030~~: Untested Tag Repository → **Resolved**
- ~~DEBT-035~~: Inconsistent Repo Test Mocking → **Resolved (false positive)**
