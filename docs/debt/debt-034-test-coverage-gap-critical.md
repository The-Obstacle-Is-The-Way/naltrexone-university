# DEBT-034: Test Coverage Gap — Must Stabilize Before New Features

**Status:** Open
**Priority:** P0
**Date:** 2026-02-01

---

## Summary

The codebase has spec implementations that outpaced test coverage. Before implementing any new specs or features, we MUST stabilize the existing codebase with comprehensive tests.

**Uncle Bob would yell at us for this.**

## Current State

### What We Have (Good)
- **172 passing unit tests** across 36 test files
- Tests are high quality: use fakes, test behavior, cover edge cases
- Domain services well tested: `grading`, `entitlement`, `shuffle`, `statistics`, `session`
- Value objects all tested
- Use cases tested: `CheckEntitlement`, `SubmitAnswer`, `GetNextQuestion`

### What's Missing (Critical Gaps)

**Untested Repositories (5):**
| Repository | Risk |
|------------|------|
| `drizzle-attempt-repository.ts` | Core functionality |
| `drizzle-bookmark-repository.ts` | User data |
| `drizzle-question-repository.ts` | Content serving |
| `drizzle-stripe-event-repository.ts` | **P1 - Payment critical** |
| `drizzle-tag-repository.ts` | Content filtering |

**Untested Infrastructure (Key):**
| File | Risk |
|------|------|
| `lib/stripe.ts` | Payment SDK wrapper |
| `lib/logger.ts` | Observability |
| `lib/request-context.ts` | Request tracking |
| `lib/content/parseMdxQuestion.ts` | Content parsing |
| `proxy.ts` | Auth middleware |
| `db/schema.ts` | Data layer (integration tests) |

**Domain Entities (No Unit Tests):**
- All 8 entities are pure types with no behavior — tests would be trivial
- **Accepted:** Per DEBT-010 (archived), trivial entity tests don't add value
- These don't need tests unless behavior is added

**React Components/Pages:**
- UI components in `components/ui/` don't need unit tests (shadcn primitives)
- Pages should be covered by E2E tests

## Impact

- **Risk:** Bugs in untested code won't be caught until production
- **Regression:** Refactoring has no safety net
- **Confidence:** Can't verify specs are correctly implemented
- **Velocity:** Time spent debugging > time spent writing tests upfront

## Resolution

### Priority Order

1. **P0 - Payment Critical (Do First):**
   - [ ] `drizzle-stripe-event-repository.test.ts`
   - [ ] `stripe-prices.test.ts` (DEBT-029)

2. **P1 - Core Functionality:**
   - [ ] `drizzle-attempt-repository.test.ts`
   - [ ] `drizzle-question-repository.test.ts`
   - [ ] `drizzle-tag-repository.test.ts`
   - [ ] `drizzle-bookmark-repository.test.ts`

3. **P2 - Infrastructure:**
   - [ ] `parseMdxQuestion.test.ts`
   - [ ] `request-context.test.ts`
   - [ ] Integration tests for all repositories

4. **P3 - E2E Coverage:**
   - [ ] Expand E2E tests beyond smoke + dark mode
   - [ ] Critical user flows: sign up → subscribe → practice

### Rule Going Forward

**NO NEW SPECS until all P0/P1 tests are written.**

Per CLAUDE.md TDD mandate:
> Before writing ANY implementation code:
> 1. Write the test first (Red)
> 2. Write minimum code to pass (Green)
> 3. Refactor if needed (Refactor)

## Test Coverage Target

| Layer | Current | Target |
|-------|---------|--------|
| Domain Services | ~90% | 100% |
| Value Objects | 100% | 100% |
| Use Cases | ~80% | 100% |
| Repositories | ~40% | 100% |
| Gateways | ~80% | 100% |
| Integration | ~20% | 80% |
| E2E | 2 tests | 10+ flows |

## Acceptance Criteria

- [ ] All 5 untested repositories have test files
- [ ] Stripe event repository has comprehensive tests (DEBT-025)
- [ ] Stripe prices config tested (DEBT-029)
- [ ] `pnpm test --coverage` shows >80% across src/
- [ ] Integration tests cover all repository methods
- [ ] E2E covers: auth flow, subscription flow, practice flow

## Related

- DEBT-025: Untested Stripe Event Repository
- DEBT-029: Untested Stripe Prices Config
- DEBT-030: Untested Tag Repository
- ADR-003: Testing Strategy
- CLAUDE.md: TDD Mandate
