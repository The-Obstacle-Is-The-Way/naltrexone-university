# BUG-135: StartPracticeSession Accepts count <= 0, Creating Empty Sessions

**Status:** Open
**Priority:** P2
**Date:** 2026-02-16

---

## Description

`StartPracticeSessionUseCase` does not validate that `input.count > 0`. When `count` is 0 or negative, the use case creates a practice session with zero questions instead of rejecting the request.

**Observed:** A `count=0` request creates a session with `actualCount: 0` and an empty `questionIds` array.

**Expected:** The use case should reject `count <= 0` with a `VALIDATION_ERROR`.

## Steps to Reproduce

1. Call `StartPracticeSessionUseCase.execute()` with `count: 0`
2. Observe that a session is created with `questionIds: []` and `questionStates: []`
3. Downstream consumers (question flow, review, navigator) receive an empty session

## Root Cause

`src/application/use-cases/start-practice-session.ts:62-66` — The `count` value is passed directly to `Array.slice(0, count)` without prior validation:

```typescript
const questionIds = shuffleWithSeed(candidateIds, seed).slice(0, input.count);
```

When `count <= 0`, `slice(0, 0)` or `slice(0, -N)` returns an empty array, and the session is created with zero questions.

## Fix

Add a validation guard before line 62:

```typescript
if (input.count <= 0 || !Number.isInteger(input.count)) {
  throw new ApplicationError(
    'VALIDATION_ERROR',
    'Practice session count must be a positive integer',
  );
}
```

## Verification

- [ ] Unit test: `it('throws VALIDATION_ERROR when count is 0')`
- [ ] Unit test: `it('throws VALIDATION_ERROR when count is negative')`

## Related

- `src/application/use-cases/start-practice-session.ts:39-87`
