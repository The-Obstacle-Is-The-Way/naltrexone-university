# DEBT-159: Practice Session Review Silently Backfills Missing Question States

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07
**Resolved:** 2026-02-08

---

## Description

`GetPracticeSessionReviewUseCase` (lines 83-103) creates default question states when a question ID in `session.questionIds` doesn't have a corresponding state in `session.questionStates`. This backfill is silent — no warning is logged to indicate potential data corruption.

```typescript
// If state is missing for a question, a default "unanswered" state is created
// No log or warning is emitted
```

If session state was partially lost (e.g., due to a CAS failure during `recordQuestionAnswer`), the review would show questions as "unanswered" without any indication that data was corrupted.

## Impact

- Users won't know their session data is partially corrupted
- Silent data loss — answers that were submitted but whose state failed to persist appear as never attempted
- Difficult to diagnose when reported as "I answered that question but it shows unanswered"

## Resolution

Added an explicit warning in `GetPracticeSessionReviewUseCase` when a question ID exists in `questionIds` but has no corresponding `questionState`:

- warning context includes `sessionId`, `userId`, and `questionId`
- behavior remains fail-open (default unanswered state) but is now observable
- unit coverage updated to assert warning emission on backfill path

## Verification

- [x] Warning log emitted when backfilling missing question state
- [x] Unit test for the backfill + warning path

## Related

- `src/application/use-cases/get-practice-session-review.ts:83-103`
- BUG-105 (concurrent answer submission race condition)
