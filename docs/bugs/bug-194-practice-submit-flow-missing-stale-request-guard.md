# BUG-194: Practice Submit Flow Missing Stale-Request Guard

**Status:** Open
**Priority:** P3
**Date:** 2026-03-03

---

## Description

`runSubmitAnswerFlow` in the practice session flow uses only an `isMounted()` guard, while `runLoadQuestionFlow` uses both `isMounted()` AND `isLatestRequest()`. This asymmetry means a stale submit response can commit state after the user has moved to a different question.

Observed behavior:
- Under slow network, if a submit is in-flight and the user advances to the next question, the stale submit response can set `submitResult` and `loadState` for the wrong question.
- Even when downstream state sync later clears mismatched `submitResult`, the stale success still propagates through `onSuccess` and can drive wrong follow-up actions (for example exam auto-advance).

Expected behavior:
- Submit responses should only commit if they match the latest request context.

## Steps to Reproduce

1. Start a practice session (tutor or exam).
2. Throttle network to slow 3G.
3. Submit an answer and immediately advance to the next question.
4. If the old submit resolves after the new question loads, observe stale result state.

## Root Cause

Tracer-bullet path:
1. `runLoadQuestionFlow` at [question-flow-actions.ts:22-97](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/practice/shared/question-flow-actions.ts:22) correctly uses `canCommit()` (line 43-47) which checks both `isMounted()` AND `isLatestRequest(requestId)`.
2. `runSubmitAnswerFlow` at [question-flow-actions.ts:133-201](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/practice/shared/question-flow-actions.ts:133) only checks `isMounted()` (lines 180, 188).
3. `runSubmitAnswerFlow` does NOT accept `createRequestSequenceId` or `isLatestRequest` parameters.
4. A stale submit passing `isMounted()` commits at line 198: `input.setSubmitResult(res.data, input.question.questionId)`.
5. The same stale path also calls `input.onSuccess?.(res.data)` at line 199, and the caller in [use-practice-session-page-controller.ts:60-71](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:60) uses that result for `maybeAutoAdvanceAfterSubmit`, so stale responses can trigger wrong navigation side effects.

The `questionId` parameter in `setSubmitResult` provides a hint to the consumer, but the guard should be at the flow level, not delegated to each consumer.

## Fix

Not yet implemented.

Expected fix shape:
- Add `createRequestSequenceId` and `isLatestRequest` parameters to `runSubmitAnswerFlow`.
- Build a `canCommit()` helper mirroring `runLoadQuestionFlow`.
- Gate all state commits behind `canCommit()`.

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification

## Related

- BUG-189 covers the same class of race condition in the question-review page controller.
- `runLoadQuestionFlow` (same file, line 22) is the reference implementation with correct guards.
