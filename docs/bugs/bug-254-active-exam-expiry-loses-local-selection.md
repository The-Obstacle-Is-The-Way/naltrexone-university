# BUG-254: Active Exam Expiry Can Finalize a Locally Selected Answer as Omitted

**Status:** In Progress
**Fix Phase:** Pending implementation (Phase 1 red test + selected approach committed)
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

Phase 1 replaces the timer-expiry browser expectation with a red regression for the intended contract:

- [`use-practice-session-page-model-timer.browser.spec.tsx`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx#L117>) selects a choice, mocks the draft save as expired, and expects the finalized summary to report `answered: 1`.
- The mock finalizer now reports `answered: 1` only when it receives a single-question `finalDraftAnswer`; today's client sends no such flush, so the focused browser run fails with `Received: 0`.

## Impact

A subscriber can lose a selected exam answer at the exact timing boundary and receive an incorrectly lower score/review result.

## Proposed Fix

Use a bounded server-side finalization flush for the single question currently visible when the exam timer expires.

Implementation path:

1. Extend `finalizeExamAnswers` input with an optional `finalDraftAnswer` object containing exactly one `questionId`, nullable `selectedChoiceId`, and `cumulativeMs`.
2. Only the expiry path passes `finalDraftAnswer`; ordinary Review & Submit finalization keeps the current contract unless it has already persisted drafts through the existing save path.
3. In `FinalizeExamAnswersUseCase`, before grading all question states, validate the final flush against the active exam session:
   - session belongs to the user and is still active exam mode;
   - the question is in that session;
   - `selectedChoiceId`, when non-null, belongs to that question;
   - `cumulativeMs` is clamped with the existing `SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS` cap;
   - the server clock is at or shortly after the session deadline, within a small named grace window, so this path covers network/event-loop delay at expiry but not arbitrary late answering.
4. Apply the validated single-question draft inside the same transaction/idempotency execution as finalization, then let the existing server grading code produce attempts and totals. This keeps grading server-authoritative and preserves finalize idempotency.
5. Update the timer browser regression so the mocked finalizer reports `answered: 1` only when it receives that single-question flush. Today it reports `answered: 0`, proving the current client would omit the local selection.

Rationale:

- This directly satisfies the core invariant: the selected answer visible at timer expiry is graded rather than silently omitted.
- It preserves the existing ordinary draft-save deadline guard, so users cannot keep saving answers after time is up.
- It avoids a client-supplied answer map. The client may send one bounded candidate draft; the server validates ownership, membership, choice validity, timing, and grading.
- The blast radius is localized to the finalization boundary and its schemas/tests. Tutor mode and normal exam navigation continue using existing draft saves.

### Rejected Alternatives

- **Pure proactive autosave/pre-expiry client flush:** saving on every exam selection reduces the timing window, but it does not close it. A selection made just before zero can still arrive at the server after the deadline and be rejected by the current `SaveExamDraftAnswerUseCase` guard.
- **Relax `SaveExamDraftAnswerUseCase.isExamExpired` generally:** this would make ordinary post-deadline draft saves succeed and violates the deadline invariant.
- **Client-supplied full answer map at finalization:** this would let a crafted client submit answers for every question at finalize time, defeating the exam timer.
- **Block finalization after the failed save and show an error:** this avoids silently omitting the answer, but it still fails the product invariant because the selected answer is not graded and the user can be stranded at an expired exam boundary.

## Failing Test Sketch

```tsx
it('grades a locally selected exam answer when timer expiry final draft save is rejected', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
  mockActiveTimedExam('2026-05-22T12:00:01.000Z');
  mockFinalizeSummaryFromFinalFlush();
  saveExamDraftAnswerMock.mockResolvedValue(
    errorResult('CONFLICT', 'Exam time has expired'),
  );

  const screen = await render(<PracticeSessionPageModelReviewProbe />);
  await screen.getByRole('button', { name: 'select-choice-1' }).click();

  await vi.advanceTimersByTimeAsync(1_000);

  expect(saveExamDraftAnswerMock).toHaveBeenCalledWith(
    expect.objectContaining({ selectedChoiceId: BROWSER_CHOICE_1_ID }),
  );
  expect(finalizeExamAnswersMock).toHaveBeenCalledWith(
    expect.objectContaining({
      finalDraftAnswer: expect.objectContaining({
        questionId: BROWSER_QUESTION_1_ID,
        selectedChoiceId: BROWSER_CHOICE_1_ID,
      }),
    }),
  );
  await expect
    .element(screen.getByTestId('summary-answered-count'))
    .toHaveTextContent('1');
});
```

## Prior Bug Cross-Refs

- BUG-238: adjacent draft timing bound, fixed. Not this bug.
- BUG-252: adjacent time-only draft persistence, fixed. Not this bug because BUG-254 loses a selected answer and changes scoring.
