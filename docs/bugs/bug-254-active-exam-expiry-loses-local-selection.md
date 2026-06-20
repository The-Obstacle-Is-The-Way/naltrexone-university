# BUG-254: Active Exam Expiry Can Finalize a Locally Selected Answer as Omitted

**Status:** Open
**Severity:** P2
**Date:** 2026-06-20
**Confirmed:** 2026-06-20
**Component:** Practice Engine / Exam Timer / Draft Finalization

---

## Summary

If a user selects an answer on the current exam question immediately before the timer expires, that selection can remain only in React state. The timer-expiry handler then tries to save the draft after the deadline, the server rejects the save as expired, and the client still finalizes the exam. `FinalizeExamAnswersUseCase` reads only the persisted draft state, so the selected answer is written as an omitted incorrect attempt.

This is distinct from BUG-252. BUG-252 was about unanswered time-only drafts. BUG-254 changes scoring because a user-visible selected answer can be lost.

## Reproduction

1. Start an exam session.
2. On the current question, wait until the countdown is about to hit zero.
3. Select an answer and stay on the page without navigating.
4. Let the timer expire.
5. Inspect the finalized attempt/review for that question.

Expected:

- The answer selected before expiry is either saved and graded, or finalization is blocked/recovered without silently omitting it.

Actual:

- The final draft save is rejected with `CONFLICT: Exam time has expired`.
- The client ignores the failed save result and still calls `finalizeExamAnswers`.
- The server finalizes the question from stale persisted draft state and records it as omitted.

## Root Cause

Active exam selection is local until a draft save occurs:

- [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L415>) updates local selection.
- The same handler returns before `commitChoice(...)` for exam mode at [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L421>).

The timer fires only at or after the deadline:

- [`use-exam-timer.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L17>) computes zero remaining seconds at the deadline.
- [`use-exam-timer.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L51>) calls `onExpire` once the timer is expired.

The expiry handler ignores a failed final draft save:

- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L153>) starts `finalizeExpiredExam`.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L159>) awaits `saveCurrentExamDraft()`.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L170>) calls `reviewStage.finalizeExamSession()` regardless of the boolean save result.

The server rejects draft saves after expiry:

- [`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts#L55) throws `CONFLICT` when `isExamExpired(...)` is true.

Finalization reads only persisted draft state:

- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L101) reads `state.draftSelectedChoiceId`.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L102) treats `null` as unanswered.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L105) writes an omitted outcome.

The existing browser test suite currently codifies the dangerous shape:

- [`use-practice-session-page-model-timer.browser.spec.tsx`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx#L78>) selects a choice, mocks the draft save as expired, and still expects finalization.
- The mocked summary in that file reports `answered: 0` at [`use-practice-session-page-model-timer.browser.spec.tsx`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx#L56>).

## Impact

A subscriber can lose a selected exam answer at the exact timing boundary and receive an incorrectly lower score/review result.

## Proposed Fix

Do not finalize from the browser after a failed final draft save when a local selected choice differs from persisted draft state. Good implementation directions:

1. Prefer server-owned expiry finalization that can atomically decide how to handle the last persisted draft.
2. If the client remains responsible for expiry finalization, make `saveCurrentExamDraft()` return enough state to distinguish "nothing to persist" from "selected answer failed to persist".
3. On expiry, block or retry finalization when a selected local choice failed to persist, and surface a recovery error instead of silently omitting the answer.
4. Add browser regression coverage that fails if `finalizeExamAnswers` is called after an expired draft-save rejection for a locally selected answer.

## Failing Test Sketch

```tsx
it('does not finalize a locally selected exam answer as omitted when expiry rejects draft save', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
  mockActiveTimedExam('2026-05-22T12:00:01.000Z');
  mockFinalizeSummary();
  saveExamDraftAnswerMock.mockResolvedValue(
    errorResult('CONFLICT', 'Exam time has expired'),
  );

  const screen = await render(<PracticeSessionPageModelReviewProbe />);
  await screen.getByRole('button', { name: 'select-choice-1' }).click();

  await vi.advanceTimersByTimeAsync(1_000);

  expect(saveExamDraftAnswerMock).toHaveBeenCalledWith(
    expect.objectContaining({ selectedChoiceId: BROWSER_CHOICE_1_ID }),
  );
  expect(finalizeExamAnswersMock).not.toHaveBeenCalled();
});
```

## Prior Bug Cross-Refs

- BUG-238: adjacent draft timing bound, fixed. Not this bug.
- BUG-252: adjacent time-only draft persistence, fixed. Not this bug because BUG-254 loses a selected answer and changes scoring.
