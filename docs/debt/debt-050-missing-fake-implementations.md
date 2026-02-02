# DEBT-050: Missing Fake Implementations for 5 Repositories

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The test helpers in `src/application/test-helpers/fakes.ts` are missing fake implementations for 5 repositories. This forces controller tests to use `vi.fn()` mocks instead of proper fakes, violating CLAUDE.md guidance.

**Missing fakes:**
1. `FakeUserRepository`
2. `FakeStripeCustomerRepository`
3. `FakeStripeEventRepository`
4. `FakeBookmarkRepository`
5. `FakeTagRepository`

**Existing fakes:**
- `FakeQuestionRepository` ✓
- `FakeAttemptRepository` ✓
- `FakePracticeSessionRepository` ✓
- `FakeSubscriptionRepository` ✓
- `FakePaymentGateway` ✓

## Impact

- Controllers that use these repositories can't be properly unit tested
- Tests use `vi.fn()` mocks instead of behavioral fakes
- Mocks test implementation details, not behavior
- Tests break when implementation changes, even if behavior is correct
- Violates CLAUDE.md: "NEVER use vi.mock() for our own code"

**Example of current (wrong) pattern:**
```typescript
const fakeDb = {
  query: { users: { findFirst: vi.fn().mockResolvedValue(null) } }
};
```

**Should be:**
```typescript
const userRepo = new FakeUserRepository([existingUser]);
```

## Resolution

1. Create `FakeUserRepository`:
```typescript
export class FakeUserRepository implements UserRepository {
  constructor(private users: User[] = []) {}

  async findById(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) ?? null;
  }
  // ... other methods
}
```

2. Create remaining 4 fake repositories following same pattern

3. Add error simulation capabilities:
```typescript
setNextError(error: ApplicationError): void
clearNextError(): void
```

4. Refactor controller tests to use fakes instead of mocks

## Verification

- [ ] All 5 fake repositories implemented
- [ ] Fakes cover all interface methods
- [ ] Fakes support error simulation
- [ ] Controller tests refactored to use fakes
- [ ] No vi.fn() mocks for repository methods

## Related

- `src/application/test-helpers/fakes.ts`
- `src/application/ports/repositories.ts`
- CLAUDE.md: "Fakes over mocks" section
- DEBT-051: Controller tests use vi.fn() instead of fakes
