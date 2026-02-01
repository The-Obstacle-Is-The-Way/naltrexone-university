# DEBT-035: Inconsistent Repository Tests Use Inline Mocks Instead of Fakes

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Summary

Some repository tests use inline mock objects with `vi.fn()` instead of following the project's "fakes over mocks" pattern. This creates inconsistency and tests implementation details rather than behavior.

## Current State

**Good (Use Case Tests):**
```typescript
// src/application/use-cases/submit-answer.test.ts
const repo = new FakeAttemptRepository();  // Uses fake
const useCase = new SubmitAnswerUseCase(repo, ...);
```

**Inconsistent (Repository Tests):**
```typescript
// src/adapters/repositories/drizzle-stripe-customer-repository.test.ts
const db = {
  query: { stripeCustomers: { findFirst: vi.fn(() => null) } },
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => ... }) }),
} as const;
const repo = new DrizzleStripeCustomerRepository(db as unknown as RepoDb);
```

## Files Affected

- `src/adapters/repositories/drizzle-stripe-customer-repository.test.ts`
- `src/adapters/repositories/drizzle-practice-session-repository.test.ts`
- `src/adapters/repositories/drizzle-subscription-repository.test.ts`

## Why This Matters

1. **Inconsistency** — Different testing patterns in same codebase confuses developers
2. **Brittle Tests** — Inline mocks couple to Drizzle's API structure
3. **Maintenance** — If Drizzle API changes, all inline mocks break
4. **Not True Unit Tests** — These test Drizzle integration, not repository logic

## The Nuance

Repository tests are in a gray area:
- They adapt between application ports and Drizzle/Postgres
- Testing them as "unit tests" with fake Db objects is borderline useful
- **Better approach:** Test repositories via integration tests against real DB

## Resolution Options

### Option A: Integration Tests Only (Recommended)

Remove unit tests for Drizzle repositories. Test them via integration tests in `tests/integration/repositories.integration.test.ts` against real Postgres.

**Pros:**
- Tests real behavior with real database
- No fake Drizzle objects needed
- Matches Clean Architecture (adapters tested at boundaries)

**Cons:**
- Slower feedback loop
- Requires DATABASE_URL

### Option B: Standardize Inline Stubs

Keep unit tests but document the pattern. Use simple stub objects (not `vi.fn()`) that return canned data.

```typescript
const stubDb = {
  query: { users: { findFirst: async () => ({ id: '1', email: 'test@example.com' }) } },
};
```

**Pros:**
- Fast unit tests
- Documents expected Drizzle query shapes

**Cons:**
- Still couples to Drizzle API
- May drift from real behavior

### Option C: Create FakeDrizzleDb

Create a shared fake Drizzle database object for all repository tests.

**Pros:**
- Consistent pattern
- Single place to update if Drizzle changes

**Cons:**
- Complex to implement
- Essentially reimplementing SQLite-in-memory

## Recommendation

**Option A** — Focus on integration tests for repositories. Unit tests for repositories that just translate between port interfaces and Drizzle don't add much value.

## Acceptance Criteria

- [ ] Decision documented in ADR or this debt item
- [ ] If Option A: Expand `tests/integration/repositories.integration.test.ts`
- [ ] If Option B/C: Standardize all repository tests to same pattern
- [ ] No `vi.fn()` for Drizzle query methods in unit tests
- [ ] CLAUDE.md/AGENTS.md guidance followed consistently

## Related

- DEBT-034: Test Coverage Gap
- ADR-003: Testing Strategy
- `src/application/test-helpers/fakes.ts`
