# DEBT-007: Fake Repositories Don't Validate Input

**Status:** Resolved
**Priority:** P3
**Date:** 2026-01-31
**Resolved:** 2026-02-01

## Summary

Fake repositories in `src/application/test-helpers/fakes.ts` accept any input without validation, unlike real Drizzle repositories which validate with Zod schemas. This means tests won't catch schema violations.

## Example

```typescript
// Real repo (drizzle-practice-session-repository.ts)
const paramsSchema = z.object({
  count: z.number().int().min(1).max(200),
  questionIds: z.array(z.string().uuid()).max(200),
  // ... validates strictly
}).strict();

// Fake repo (fakes.ts line 187)
const params = input.paramsJson as { /* unsafe cast, no validation */ };
```

## Impact

- Tests pass with invalid data that would fail in production
- Schema changes in real repos not reflected in fakes
- False confidence in test coverage

## Affected Fakes

- `FakePracticeSessionRepository.create()` - no params validation
- `FakeAttemptRepository.create()` - no input validation
- All fakes - no UUID format validation

## Recommended Fix

Option A: Add Zod validation to fakes (duplicate schemas)
Option B: Extract shared schemas to domain layer
Option C: Accept the gap, rely on integration tests

## Acceptance Criteria

- Document chosen approach in ADR-003 (testing strategy)
- If Option A/B: Add validation to fakes
- If Option C: Add note that integration tests cover validation

## Resolution

We chose **Option C**.

- Fake repositories remain lightweight in-memory implementations and do not attempt to replicate adapter-boundary Zod parsing.
- Adapter-boundary validation is covered by integration tests in `tests/integration/**` (real Postgres + real Drizzle repositories).
- ADR-003 was updated to explicitly document this division of responsibility.
