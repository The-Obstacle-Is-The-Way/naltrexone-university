# BUG-134: Mark-for-Review Race Can Update the Wrong Question UI State

**Priority:** P2
**Status:** Open
**Found:** 2026-02-16
**Component:** Frontend — Practice Session Mark-for-Review

---

## Summary

In an **Exam** session, `onToggleMarkForReview` can update the *current* question’s `sessionInfo.isMarkedForReview` using the result of an async request that was initiated for a **different** question. If the user navigates to another question while the mark/unmark request is in-flight, the late response mutates `sessionInfo` without verifying the currently displayed question, causing the Mark/Unmark UI to reflect the wrong question’s state.

## Impact

- The Mark/Unmark button can flip unexpectedly on the next question after navigation.
- A follow-up click can toggle the wrong server-side question (user intent mismatch) because the UI state is incorrect.

## Reproduction (Likely)

1. Start an **Exam** practice session.
2. On question A, click **Mark for review**.
3. Before the request resolves, click **Next Question** (or otherwise navigate) to question B.
4. When the mark request resolves, the Mark/Unmark state for question B may change unexpectedly.

(This depends on timing; easiest to reproduce with higher latency.)

## Root Cause

`usePracticeSessionMarkForReview` calls `input.applySessionInfo((prev) => ({ ...prev, isMarkedForReview: res.data.markedForReview }))` after the await, but:

- `sessionInfo` represents the *currently displayed* question’s session state.
- `sessionInfo` does **not** carry a `questionId`, so the update cannot be scoped to the request’s target question.
- Navigation remains enabled while `isMarkingForReview` is true, so the “current” question can change while the request is in-flight.

## Evidence (SSOT)

- Unscoped `sessionInfo` mutation after the async call:
  - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts:109`
- Navigation does not disable while marking:
  - Next Question disabled state ignores `isMarkingForReview`:
    - `app/(app)/app/practice/components/practice-view.tsx:260`
  - Mark button disabled state does include `isMarkingForReview`:
    - `app/(app)/app/practice/components/practice-view.tsx:283`

## Suggested Fix

Guard the post-await `applySessionInfo` update so it only applies when the request still matches the currently displayed question:

- Track the current `questionId` in a ref that is updated every render.
- Capture `requestQuestionId` at click time.
- After the await, only call `applySessionInfo` when `currentQuestionIdRef.current === requestQuestionId`.

The `review` update already scopes by `res.data.questionId` and should remain as-is.

## Acceptance Criteria

- [ ] Navigating during mark/unmark cannot change the Mark/Unmark state of the wrong question.
- [ ] Mark/unmark still updates immediately on the current question when the user stays on that question.
- [ ] Add deterministic regression coverage (preferred) or document why it cannot be made deterministic.

