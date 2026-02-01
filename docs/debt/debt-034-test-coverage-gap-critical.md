# DEBT-034: Test Coverage Gap — Must Stabilize Before New Features

**Status:** Open
**Priority:** P0
**Date:** 2026-02-01

---

## Summary

The codebase has spec implementations that outpaced test coverage. Before implementing any new specs or features, we MUST stabilize the existing codebase with comprehensive tests.

**Uncle Bob would yell at us for this.**

## Testing Philosophy (Uncle Bob / Clean Code)

### Core Principles

1. **Test Behavior, Not Implementation**
   - Tests should verify WHAT code does, not HOW it does it
   - If you refactor internals, tests should still pass
   - Bad: testing private methods, internal state
   - Good: testing public API, observable outcomes

2. **Fakes Over Mocks**
   - **Fakes** = Simplified working implementations (e.g., `FakeAttemptRepository` with in-memory array)
   - **Mocks** = Record calls and return canned responses (brittle, couples to implementation)
   - We use fakes in `src/application/test-helpers/fakes.ts`
   - Never use `jest.mock()` or `vi.mock()` for our own code

3. **Arrange-Act-Assert Pattern**
   ```typescript
   it('grades correct answer', () => {
     // Arrange - set up test data
     const question = createQuestion({ choices: [...] });

     // Act - call the thing being tested
     const result = gradeAnswer(question, 'c2');

     // Assert - verify the outcome
     expect(result.isCorrect).toBe(true);
   });
   ```

4. **One Concept Per Test**
   - Each test should verify one thing
   - Test name should describe the scenario
   - Bad: `it('works')`
   - Good: `it('returns isCorrect=false when incorrect choice selected')`

5. **Tests Are Documentation**
   - Reading tests should explain how the code works
   - Tests serve as living examples of usage

### What Needs Unit Tests

| Type | Needs Tests? | Why |
|------|--------------|-----|
| Domain Services | **YES** | Business logic |
| Value Objects | **YES** | Validation, equality |
| Use Cases | **YES** | Application logic |
| Repositories | **YES** | Data mapping, queries |
| Gateways | **YES** | External integration |
| Pure Types/Entities | NO | No behavior to test |
| UI Components (shadcn) | NO | Third-party primitives |
| Config/Constants | MAYBE | Only if complex mapping |

### Test Location Convention

Tests are **colocated** with source files (not in `tests/unit/`):

```
src/domain/services/
├── grading.ts          # Source
├── grading.test.ts     # Unit test (colocated)
```

This is the TypeScript convention and matches CLAUDE.md guidance.

## Current State

### Coverage by Layer

| Layer | Source | Tests | Coverage |
|-------|--------|-------|----------|
| Domain Services | 6 | 5 | 83% |
| Value Objects | 7 | 7 | **100%** |
| Use Cases | 3 | 3 | **100%** |
| Repositories | 8 | 5 | **63%** |
| Gateways | 2 | 2 | **100%** |

### What's Missing (Critical Gaps)

**Untested Repositories (3):**
| Repository | Risk |
|------------|------|
| `drizzle-attempt-repository.ts` | Core functionality |
| `drizzle-bookmark-repository.ts` | User data |
| `drizzle-question-repository.ts` | Content serving |
| `drizzle-stripe-event-repository.ts` | **P1 - Payment critical** |
| `drizzle-tag-repository.ts` | Content filtering |

**Untested Config:**
| File | Risk |
|------|------|
| `src/adapters/config/stripe-prices.ts` | Payment mapping |

**Domain Entities (No Unit Tests — ACCEPTED):**
- All 8 entities are pure types with no behavior
- Per DEBT-010 (archived), trivial entity tests don't add value
- These don't need tests unless behavior is added

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

## Test Quality Checklist

When writing tests, verify:

- [ ] Uses fakes from `src/application/test-helpers/fakes.ts` (not mocks)
- [ ] Tests behavior, not implementation details
- [ ] Each test verifies one concept
- [ ] Test name describes the scenario clearly
- [ ] Covers happy path AND error cases
- [ ] Follows Arrange-Act-Assert pattern
- [ ] Uses test factories (`createQuestion`, `createChoice`, etc.)

## Coverage Target

| Layer | Current | Target |
|-------|---------|--------|
| Domain Services | 83% | 100% |
| Value Objects | 100% | 100% |
| Use Cases | 100% | 100% |
| Repositories | 63% | 100% |
| Gateways | 100% | 100% |
| Integration | ~20% | 80% |
| E2E | 2 tests | 10+ flows |

## Acceptance Criteria

- [ ] All untested repositories have test files
- [ ] Stripe event repository has comprehensive tests (DEBT-025)
- [ ] Stripe prices config tested (DEBT-029)
- [ ] `pnpm test --coverage` shows >80% across src/
- [ ] Integration tests cover all repository methods
- [ ] E2E covers: auth flow, subscription flow, practice flow
- [ ] No `jest.mock()` or `vi.mock()` for our own code

## Related

- DEBT-025: Untested Stripe Event Repository
- DEBT-029: Untested Stripe Prices Config
- DEBT-030: Untested Tag Repository
- ADR-003: Testing Strategy
- CLAUDE.md: TDD Mandate
