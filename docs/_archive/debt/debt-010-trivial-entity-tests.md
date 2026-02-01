# DEBT-010: Trivial Entity Tests Provide False Confidence

**Status:** Resolved
**Priority:** P1
**Date:** 2026-01-31
**Resolved:** 2026-02-01

## Summary

The `User` and `Question` entity tests only validate that TypeScript types work correctly. They don't test any business logic, validation, or behavior. These tests always pass as long as TypeScript compiles.

## Location

- **File:** `src/domain/entities/user.test.ts` lines 1-16
- **File:** `src/domain/entities/question.test.ts` lines 4-22

## Problematic Test

```typescript
describe('User entity', () => {
  it('has required readonly properties', () => {
    const user: User = {
      id: 'uuid-123',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(user.id).toBe('uuid-123');  // TypeScript already validates this!
    expect(user.email).toBe('test@example.com');
  });
});
```

## Why This Is Bad

1. Test will **always pass** as long as TypeScript compiles
2. Tests TypeScript's type system, not domain logic
3. If entities had validation or computed properties, bugs go uncaught
4. Gives false confidence in coverage metrics

## Impact

- Artificially inflates test coverage
- Real entity behavior (if added) would be untested
- Maintainers may think entities are "fully tested"

## Decision Options

### Option A: Delete trivial tests
If entities are pure data types with no logic, delete the tests. TypeScript already enforces the structure.

### Option B: Add meaningful tests
If entities should have behavior (factory methods, validation, computed properties), add tests for that behavior.

### Option C: Document intent
Add comments explaining these are "type smoke tests" only, not behavioral tests.

## Recommendation

Option A - delete. Pure type definitions don't need runtime tests.

## Resolution

- Deleted `src/domain/entities/user.test.ts` and `src/domain/entities/question.test.ts`.
- Documented that pure entity type aliases are not runtime-tested (see ADR-003).

## Acceptance Criteria

- Remove tests that only validate TypeScript types
- OR add meaningful behavioral tests
- Document decision in ADR-003 (testing strategy)
