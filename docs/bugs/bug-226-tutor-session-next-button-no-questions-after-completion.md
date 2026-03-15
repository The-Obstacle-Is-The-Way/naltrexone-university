# BUG-226: Tutor Session "Next" Button Shows "No More Questions" After All Answered

**Status:** Open
**Priority:** P2
**Date:** 2026-03-15

## Summary

Once all questions in a tutor practice session are answered, the "Next" button on any completed question shows "No more questions found. End session" instead of advancing to the next question by index. The question navigator buttons (1–5) still work correctly because they use direct `questionId` navigation, but the primary "Next" action only searches for the next *unanswered* question — and finds none.

## Impact

- After completing a 5-question tutor session, clicking "Next" on question 3 does not go to question 4 — it shows the empty state.
- The user's only recourse is to manually click a numbered navigator button or end the session.
- This makes post-completion review feel broken. The "Previous" button works because it navigates by ID, but forward navigation is effectively disabled once the session is complete.
- This is a UX-level regression that affects every completed tutor session.

## Verification Notes

1. `src/application/use-cases/get-next-question.ts:158-187` — `targetQuestionId` resolution only searches for unanswered questions when `fromIndex` is provided (via `!state.latestSelectedChoiceId` filter). Returns `null` when all questions have a `latestSelectedChoiceId`.
2. `src/application/use-cases/get-next-question.test.ts:591-613` — Test `'returns null when session is complete'` explicitly asserts `null` return when all questions are answered. This confirms the behavior is codified (by-design for "advance", but wrong for "review next").
3. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:158-179` — `onNextQuestion` passes `fromIndex` (current question index) but no `questionId`, so the use case enters the unanswered-search path.
4. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:146-156` — `onNavigateQuestion` passes a specific `questionId`, bypassing the unanswered filter entirely. This is why navigator buttons still work.
5. `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:84-99` — View computes `nextQuestionId` from navigator rows using `row.isAvailable` (not unanswered status), but this ID is only used for the navigator, not for the "Next" action.
6. `app/(app)/app/practice/components/practice-view.tsx:229-245` — Renders "No more questions found." when `loadState.status === 'ready' && props.question === null`.

## Root Cause

The `GetNextQuestionUseCase` conflates two distinct navigation intents:

- **"Advance"** (during active play): find the next unanswered question — correct behavior.
- **"Next"** (during post-completion review): navigate to the next question by session index — broken because the same unanswered-search path returns `null`.

The navigator buttons avoid this because they call `onNavigateQuestion(questionId)` with an explicit ID, which hits the `typeof questionId === 'string'` branch (line 159) and returns that question directly.

## Precise TDD Fix

1. Add failing test in `get-next-question.test.ts` for the scenario: all questions answered, `fromIndex` provided — should return the next question by index rather than `null`.
2. Update the `targetQuestionId` resolution in `get-next-question.ts:158-187`: when the unanswered search returns `null` and `fromIndex` is provided, fall back to the next question by index order (`orderedStates[startIndex + 1]?.questionId`) instead of returning `null`.
3. Update or replace the existing `'returns null when session is complete'` test: `null` should only be returned when `fromIndex` is at the last question AND all are answered (i.e., there is genuinely no next question in the sequence).
4. Verify the "Previous" direction is unaffected (it already navigates by ID via navigator).
5. Verify exam-mode sessions are unaffected (exam mode may have different completion semantics).
