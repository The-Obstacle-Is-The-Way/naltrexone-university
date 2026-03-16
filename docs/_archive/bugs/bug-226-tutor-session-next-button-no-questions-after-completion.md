# BUG-226: Completed Session "Next" Button Can Dead-End Into "No More Questions"

**Status:** Resolved (PR #220)
**Priority:** P2
**Date:** 2026-03-15
**Resolved:** 2026-03-15

## Summary

When a user reopens an earlier question inside a completed practice session and clicks "Next", the session page can show "No more questions found. End session" instead of navigating to the next available question. The page decides whether the "Next" button should be visible from the navigator's `nextQuestionId`, but the click handler still routes through the unanswered-only `fromIndex` path. This is not tutor-only; the session flow is mode-agnostic, so exam sessions can hit the same path after completion if the user navigates backward before entering review.

## Impact

- In a completed tutor session, reopening question 3 and clicking "Next" can dead-end into the empty state instead of opening question 4.
- In a completed exam session, the same dead-end is reachable if the user navigates back to an earlier answered question before entering review.
- Previous and numbered navigator buttons still work, so the UI presents contradictory navigation behavior on the same screen.
- The bug is confined to session-based practice. Quick practice is unaffected.

## Verification Notes

### Vertical tracer bullets

1. `app/(app)/app/practice/components/practice-view.tsx:312-323` renders the "Next" button and calls `props.onNextQuestion`.
2. `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:84-99,183-240` computes `nextQuestionId` from navigator rows and `row.isAvailable`, but only uses that value to set `hasNextQuestion={nextQuestionId !== null}`. The click path is still `onNextQuestion={props.onNextQuestion}`. `Previous` is different: `101-105` calls `onNavigateQuestion(previousQuestionId)` directly.
3. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:146-173` shows the exact asymmetry. `onNavigateQuestion` calls `loadNextQuestion({ questionId })`, while `onNextQuestion` computes `fromIndex` from the current session index and calls `loadNextQuestion({ fromIndex })`.
4. `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:28-57` forwards either `questionId` or `fromIndex` into the generic load flow. `src/adapters/controllers/question-controller.ts:192-204` forwards those same fields into `GetNextQuestionUseCase.execute(...)`.
5. `src/application/use-cases/get-next-question.ts:158-187` uses `questionId` directly, but the `fromIndex` branch only scans unanswered states: forward, then wrapped, then the current unanswered state. There is no next-by-index fallback. If every state has `latestSelectedChoiceId`, it returns `null`.
6. `app/(app)/app/practice/shared/question-flow-actions.ts:113-117` commits `res.data` directly. When `res.data` is `null`, the question becomes `null` while `loadState` still transitions to `ready`.
7. `app/(app)/app/practice/components/practice-view.tsx:229-245` renders "No more questions found." exactly when `loadState.status === 'ready' && props.question === null`.
8. `src/application/use-cases/get-next-question.test.ts:224-326` covers unanswered `fromIndex` behavior, and `src/application/use-cases/get-next-question.test.ts:591-613` covers the initial-load complete-session `null` case. There is no existing test for the completed-session `Next` path with `fromIndex`.

### Horizontal tracer bullets

1. The production `getNextQuestion` callers are quick practice and session practice. Only the session flow passes `fromIndex`; quick practice uses filter-based loading only (`app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:170-183`, `app/(app)/app/practice/quick/quick-practice-client.tsx:72-118`). The bug is therefore session-only.
2. The `onNextQuestion` versus `onNavigateQuestion` asymmetry exists only in `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts`. Non-session practice has no sibling-question ID navigation.
3. Exam mode shares the same session view, hook, page logic, controller, and use-case path. `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:146-163` auto-advances after submit while unanswered questions remain, which hides the bug during ordinary exam progression, but it does not change the completed-session back-navigation path. This is an inference from the shared code path.
4. Previous navigation does not have the inverse bug because it is ID-based in the page view (`app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:101-105`).
5. "No more questions found." appears elsewhere in quick/general practice and is correct there. It is only wrong in session practice when `null` is produced by the mismatched completed-session `Next` path.

## Root Cause

This is a navigation-contract mismatch, not just a use-case defect:

- The session page decides whether a next question exists by computing `nextQuestionId` from navigator rows and `row.isAvailable`.
- The same page then ignores that concrete ID and dispatches the "Next" click through `onNextQuestion()`, which only supplies `fromIndex`.
- `GetNextQuestionUseCase` treats `fromIndex` as "find the next unanswered question", not "open the next available session question".
- Once the session is complete, those two definitions diverge. The UI can show a valid "Next" button while the load path still returns `null`.

## Precise TDD Fix

1. Add a failing session-navigation test at the UI/controller boundary, not just the use case. The red test should cover: completed session, user reopens a non-final question, the navigator has a next available row, and clicking "Next" opens that row instead of the empty state.
2. Mirror the existing "Previous" behavior for forward navigation: when the session page already knows `nextQuestionId`, route the click through `onNavigateQuestion(nextQuestionId)` (or an equivalent explicit-ID API) instead of the unanswered-only `fromIndex` path.
3. Keep `fromIndex` semantics for active-play advance and exam auto-advance, where "next unanswered" remains the correct behavior.
4. Preserve the existing `returns null when session is complete` use-case contract for the no-`questionId`, no-`fromIndex` initial-load path. Add new tests for completed-session review navigation rather than rewriting that test to assert different semantics.
5. Verify both tutor and exam completed-session back-navigation flows. Verify quick practice remains unchanged.
