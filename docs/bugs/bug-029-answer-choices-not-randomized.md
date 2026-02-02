# BUG-029: Answer Choices Not Randomized

## Severity: P1 - High (Test Validity Issue)

## Summary
Answer choices are returned in a fixed `sortOrder` from the database without any randomization. This means the correct answer is always in the same position relative to other answers, allowing users to pattern-match positions instead of understanding content.

## Location
- `src/application/use-cases/get-next-question.ts:60-67`
- `src/adapters/repositories/drizzle-question-repository.ts:138`

## Current Behavior
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

## Recommended Fix
**Option A:** Shuffle choices in the use case:
```typescript
// get-next-question.ts
import { shuffleWithSeed, createSeed } from '@/src/domain/services/randomization';

const seed = createSeed(userId, question.id);
const shuffledChoices = shuffleWithSeed(question.choices, seed);
```

**Option B:** Shuffle client-side (if determinism not needed):
```typescript
// In PracticeView component
const shuffledChoices = useMemo(
  () => [...question.choices].sort(() => Math.random() - 0.5),
  [question.questionId]
);
```

**Prefer Option A** for reproducible sessions (same shuffle for same user reviewing same question).

## Related
- `src/domain/services/shuffle.ts` - Already has `shuffleWithSeed` and `createSeed` (used for question order in sessions, but NOT for choice order)
- `src/adapters/controllers/practice-controller.ts:125-127` - Uses shuffle for question IDs only
- SPEC-011: Practice flow (should specify choice randomization)
