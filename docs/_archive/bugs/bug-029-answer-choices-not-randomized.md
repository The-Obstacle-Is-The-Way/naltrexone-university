# BUG-029: Answer Choices Not Randomized

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

Answer choices are returned in a fixed `sortOrder` from the database without any randomization. This means the correct answer is always in the same position relative to other answers, allowing users to pattern-match positions instead of understanding content.

## Location

- `src/application/use-cases/get-next-question.ts:60-67`
- `src/adapters/repositories/drizzle-question-repository.ts:138`

## Current Behavior (Before Fix)

```typescript
// drizzle-question-repository.ts:138
.sort((a, b) => a.sortOrder - b.sortOrder)  // Deterministic sort

// Test explicitly confirms this:
// get-next-question.test.ts:215-240
it('returns choices sorted by sortOrder', async () => {
  // ...verifies choices come back in sortOrder
});
```

## Expected Behavior

Choices should be shuffled randomly for each question presentation:
1. Seed-based randomization (reproducible per user+question for consistency)
2. Or true random shuffle per presentation

## Impact

- **Test validity compromised:** Users can game the system by noting answer positions
- **Learning undermined:** Pattern matching replaces actual knowledge
- **Certification risk:** If used for certification, results are unreliable

## Root Cause

Design oversight. The `sortOrder` field was intended for authoring (content management), not for presentation order.

## Fix

Implemented Option A - shuffle choices in the use case with deterministic seed:

1. Added `createQuestionSeed(userId, questionId)` to `src/domain/services/shuffle.ts`
2. Updated `GetNextQuestionUseCase.mapChoicesForOutput()` to:
   - Accept `userId` parameter
   - Create seed with `createQuestionSeed(userId, questionId)`
   - Apply `shuffleWithSeed()` before mapping choices
3. Same user+question always gets same shuffle order (consistent review experience)
4. Different users get different shuffle orders (prevents cheating)

## Verification


- [x] Unit test: `createQuestionSeed` produces consistent seed for same inputs
- [x] Unit test: `createQuestionSeed` produces different seeds for different inputs
- [x] Unit test: Same user+question always gets same shuffle order
- [x] Unit test: Different users get different shuffle orders
- [x] All 384 tests pass
- [x] TypeScript compiles without errors
- [x] Production build succeeds

## Related

- `src/domain/services/shuffle.ts` - `createQuestionSeed`, `shuffleWithSeed`
- `src/application/use-cases/get-next-question.ts` - Updated `mapChoicesForOutput`
- SPEC-011: Practice flow
