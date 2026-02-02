# DEBT-051: Controller Tests Use vi.fn() Instead of Fakes

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

All 6 controller test files use `vi.fn()` to mock dependencies instead of using fake implementations passed via dependency injection. This violates CLAUDE.md guidance and tests implementation details rather than behavior.

**Affected files:**
- `practice-controller.test.ts`
- `bookmark-controller.test.ts`
- `question-controller.test.ts`
- `stats-controller.test.ts`
- `review-controller.test.ts`
- `billing-controller.test.ts`

**Current pattern (wrong per CLAUDE.md):**
```typescript
const checkEntitlementUseCase = {
  execute: vi.fn(async () => ({ isEntitled })),
};

const deps = {
  checkEntitlementUseCase,
  attemptRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  // ...
};
```

**Correct pattern (per CLAUDE.md):**
```typescript
const subscriptionRepo = new FakeSubscriptionRepository([activeSubscription]);
const checkEntitlementUseCase = new CheckEntitlementUseCase(
  subscriptionRepo,
  () => new Date('2026-01-15')
);

const deps = {
  checkEntitlementUseCase,
  attemptRepository: new FakeAttemptRepository([]),
  // ...
};
```

## Impact

- Tests coupled to implementation details
- Refactoring internal implementation breaks tests
- Can't verify real behavior — only that methods were called
- Inconsistent with domain/use-case test patterns
- Makes it harder to understand what the code actually does

## Resolution

1. First: Complete DEBT-050 (create missing fake repositories)

2. Refactor each controller test file:
   - Replace vi.fn() mocks with fake instances
   - Use real use case instances with fake dependencies
   - Test behavior, not method calls

3. Remove all `vi.fn()` calls for repository and use case dependencies

4. Keep vi.fn() only for:
   - External SDK mocks (Clerk, Stripe)
   - Spying on fake methods when needed

## Verification

- [ ] All 6 controller test files refactored
- [ ] No vi.fn() for repositories or use cases
- [ ] Tests still pass after refactoring
- [ ] Tests verify behavior, not method calls

## Related

- DEBT-050: Missing fake implementations
- CLAUDE.md: "Fakes over mocks" section
- `src/adapters/controllers/*.test.ts`
