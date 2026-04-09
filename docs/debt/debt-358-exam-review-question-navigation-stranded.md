# DEBT-358: Exam Review Question Navigation Stranded — Clicking a Question From Review & Submit Disables the Question Navigator

**Priority:** P2
**Created:** 2026-04-09
**Source:** Manual testing during DEBT-353 review
**Related:** [DEBT-353](../_archive/debt/debt-353-practice-session-results-orchestrator-decomposition.md), [FE-002](../_archive/debt/fe-002-usepracticesessionreviewstage-exceeds-150-line-guideline.md)

---

## Problem Statement

During an exam session, the "Review & Submit" screen lists all questions with their answered/unanswered/marked status. Clicking a specific question row is supposed to return you to that question in the practice view so you can change your answer or continue navigating the exam. The question loads correctly, but the question navigator (previous/next) is permanently disabled — the student is stranded on that one question with no way to browse adjacent questions.

### What the student experiences

1. Answers 3 questions, clicks "Finish exam" → lands on **Review & Submit** screen
2. Clicks question 2 to revisit it → question 2 loads correctly in the practice view
3. Tries to navigate to question 1 or 3 using next/previous → **"No more questions found"** or no response
4. The only escape is "Finish exam" again, which takes them back to Review & Submit

### Expected behavior

Clicking a question from Review & Submit should return you to the full practice view with the navigator intact — you should be able to browse all questions freely, just as you could before entering Review & Submit.

## Root Cause

The bug is in [`use-practice-session-review-stage-state.ts:137-145`](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts):

```typescript
const onOpenReviewQuestion = useCallback(
  (questionId: string): void => {
    setReview(null);
    setReviewLoadState({ status: 'idle' });
    setIsInReviewStage(true);          // ← set to true, never reset
    input.loadSpecificQuestion(questionId);
  },
  [input.loadSpecificQuestion],
);
```

`setIsInReviewStage(true)` is set when the user clicks a question from Review & Submit, but it is **never reset to `false`** after the question loads.

This matters because `createNavigatorEffect` in [`practice-session-page-logic.ts:261`](../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts) unconditionally disables the navigator when `isInReviewStage` is `true`:

```typescript
if (input.summary || input.isInReviewStage || !input.sessionInfo) {
  input.setNavigator(null);
  input.setNavigatorLoadState({ status: 'idle' });
  return () => {};
}
```

With the navigator set to `null`, [`findAdjacentAvailableQuestionId`](../../app/(app)/app/practice/[sessionId]/components/practice-session-question-navigation.ts) returns `null` for both directions. `PracticeSessionPageView` then falls back to `onNextQuestion()` which asks the server for the sequentially next question — but since all exam questions are already answered, the server returns `null`, producing "No more questions found."

### Why the "Previous" button does nothing

`onPreviousQuestion` in [`practice-session-page-view.tsx:80-84`](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx) only fires when `previousQuestionId` is non-null. With the navigator null, `previousQuestionId` is always null, so clicking Previous is a no-op.

## This bug is pre-existing

`setIsInReviewStage(true)` without a corresponding reset has been present since the original FE-002 hook extraction (commit `c7745686`). DEBT-350 and DEBT-353 did not introduce or change this behavior.

## Audit Notes

- `setIsInReviewStage` is only mutated inside `usePracticeSessionReviewStageState`. The full state machine is:
  - initial state: `false`
  - exam review load success: `true`
  - non-exam review load success: `false`
  - open a review question: currently `true` (this is the bug)
  - finalize review: `false`
- `onNavigateQuestion` in [`use-practice-session-question-flow.ts`](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts) does call `saveCurrentExamDraft()` before loading the requested question, but when invoked from Review & Submit there is no active question, so `saveCurrentExamDraft()` returns `true` immediately. The navigation request is not being blocked by draft-save failure.
- Resetting `isInReviewStage` to `false` when leaving Review & Submit should not break the "Finish exam" path. `onEndSession` still routes exam-mode questions back through review because it checks `sessionMode === 'exam'` independently of `isInReviewStage`.
- DEBT-350 post-exam review continuity is not coupled to this flag. That flow is controlled by `examResultsSubstage`, `postExamReview`, and related post-exam state.

## Current Code References

- [`use-practice-session-review-stage-state.ts:137-145`](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts) — `onOpenReviewQuestion` sets `isInReviewStage = true` without reset
- [`practice-session-page-logic.ts:247-265`](../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts) — `createNavigatorEffect` disables navigator when `isInReviewStage` is true
- [`practice-session-question-navigation.ts:4-24`](../../app/(app)/app/practice/[sessionId]/components/practice-session-question-navigation.ts) — `findAdjacentAvailableQuestionId` returns null when navigator is null
- [`practice-session-page-view.tsx:73-89`](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx) — the resolved Next action falls through to sequential load when no adjacent navigator target exists
- [`use-practice-session-question-flow.ts:252-269`](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts) — `onNavigateQuestion` saves the current exam draft before loading the requested question, but that save short-circuits to `true` when no active exam question exists
- [`practice-view.tsx:406-408`](../../app/(app)/app/practice/components/practice-view.tsx) — "No more questions found" rendered when `question === null`

## Likely Fix Direction

`onOpenReviewQuestion` should reset `isInReviewStage` to `false` after dispatching the question load, since the user is leaving the Review & Submit screen and returning to the active question flow. This would allow `createNavigatorEffect` to re-fetch the navigator data for the session.

The simplest change is:

```typescript
const onOpenReviewQuestion = useCallback(
  (questionId: string): void => {
    setReview(null);
    setReviewLoadState({ status: 'idle' });
    setIsInReviewStage(false);           // ← was true; should be false
    input.loadSpecificQuestion(questionId);
  },
  [input.loadSpecificQuestion],
);
```

This needs careful validation — the navigator effect must re-fire with `isInReviewStage === false` and successfully load the navigator data while the question is also loading. Race conditions between the navigator fetch and the question fetch should be tested.

## Acceptance Criteria

- Clicking a question from Review & Submit loads that question **and** restores the question navigator
- Previous/Next navigation works after returning from Review & Submit
- The navigator shows all exam questions with their current answered/marked status
- Returning to Review & Submit from the restored flow still works correctly
- Existing DEBT-350 post-exam review behavior is not affected (that uses `examResultsSubstage`, not `isInReviewStage`)

## Testing Requirements

- Browser spec: click question from exam review → verify navigator loads and adjacent navigation works
- Browser spec: navigate previous/next after returning from review → verify correct question loads
- Browser spec: return to Review & Submit after navigating → verify review still loads correctly
- Unit test: verify `onOpenReviewQuestion` resets `isInReviewStage` to `false`
- Regression: existing review-stage and navigator tests remain green

## Risks / Coupling

- The `isInReviewStage` flag gates several behaviors beyond the navigator. Resetting it to `false` must not break review-stage error handling, finalization, or the end-session guard.
- The navigator fetch is async — if it races with the question load, the navigator might briefly show stale data or a loading state. This is acceptable UX but should be tested.
- This fix is small enough to ship independently but touches the same hook seam as DEBT-353.
