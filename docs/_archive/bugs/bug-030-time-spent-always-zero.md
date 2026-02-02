# BUG-030: Time Spent Always Zero

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

Every answer attempt is recorded with `timeSpentSeconds: 0`. No timer mechanism exists to track how long users spend on each question.

## Location

- `src/application/use-cases/submit-answer.ts:60`
- `app/(app)/app/practice/page.tsx` (no timer implementation)

## Current Behavior (Before Fix)

```typescript
// submit-answer.ts:60
const attempt = await this.attempts.insert({
  userId: input.userId,
  questionId: question.id,
  practiceSessionId: session ? session.id : null,
  selectedChoiceId: input.choiceId,
  isCorrect: grade.isCorrect,
  timeSpentSeconds: 0,  // ALWAYS ZERO - hardcoded
});
```

The database column exists (`db/schema.ts:308`), but no code calculates or passes actual time spent.

## Expected Behavior

1. Start timer when question is displayed
2. Stop timer when answer is submitted
3. Send elapsed time to server with submission
4. Store actual `timeSpentSeconds` in attempts table

## Impact

- **No pacing analytics:** Cannot identify questions users struggle with (time-wise)
- **No exam simulation:** Real exams are timed; users can't practice pacing
- **No performance insights:** "Slow but correct" vs "fast but wrong" not distinguishable
- **Feature incomplete:** Database schema supports it, but feature is unwired

## Root Cause

Timer implementation was never built. The field was added to schema anticipating the feature.

## Fix

1. **Use Case (`src/application/use-cases/submit-answer.ts`):**
   - Added optional `timeSpentSeconds` to `SubmitAnswerInput` type
   - Changed `timeSpentSeconds: 0` to `timeSpentSeconds: input.timeSpentSeconds ?? 0`

2. **Controller (`src/adapters/controllers/question-controller.ts`):**
   - Added `timeSpentSeconds` to Zod schema: `z.number().int().min(0).max(86400).optional()`
   - Pass `timeSpentSeconds` from parsed input to use case

3. **Frontend (`app/(app)/app/practice/page.tsx`):**
   - Added `questionLoadedAt` state (number | null)
   - Set timestamp when question loads successfully
   - Calculate elapsed seconds on submit: `Math.floor((Date.now() - questionLoadedAt) / 1000)`
   - Reset timer when loading next question

## Verification


- [x] Unit test: Use case stores `timeSpentSeconds` from input
- [x] Unit test: Use case defaults to 0 when not provided
- [x] Unit test: Controller accepts `timeSpentSeconds` in schema
- [x] Unit test: Controller rejects negative `timeSpentSeconds`
- [x] Unit test: Controller rejects `timeSpentSeconds` > 86400 (24h)
- [x] All 384 tests pass
- [x] TypeScript compiles without errors
- [x] Production build succeeds

## Related

- SPEC-011: Practice flow
- BUG-020: Practice sessions never started (related timing feature)
