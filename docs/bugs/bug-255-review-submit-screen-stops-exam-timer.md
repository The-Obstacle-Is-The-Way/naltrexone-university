# BUG-255: Review & Submit Screen Stops the Active Exam Timer

**Status:** Open
**Severity:** P4
**Date:** 2026-06-20
**Confirmed:** 2026-06-20
**Component:** Practice Engine / Exam Timer / Review & Submit Lifecycle

---

## Summary

The active exam timer is disabled once the user enters the Review & Submit screen. If the deadline passes while the user remains on that screen, the exam is not auto-finalized. The user can submit later, and the session `endedAt`/summary duration are recorded from the late submit time rather than the exam deadline.

This is a timer-enforcement gap in a normal exam workflow: reviewing answers before final submit.

**Scope (why P4):** the only effect is an inflated recorded `durationSeconds`/`endedAt`. Answers cannot be changed after the deadline — every draft save routes through `SaveExamDraftAnswerUseCase`, which rejects post-deadline saves with `CONFLICT: Exam time has expired` ([`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts#L55)). There is no score or data-integrity impact; the recorded duration stat is the entire harm.

## Reproduction

1. Start an exam session.
2. Answer or skip questions until Review & Submit is available.
3. Click **Review & Submit** before time expires.
4. Stay on the Review & Submit screen past the deadline.
5. Click **Submit exam** later.

Expected:

- The timer remains active during Review & Submit and auto-finalizes at the deadline, or the server caps finalization time at the exam deadline.

Actual:

- The timer is disabled while `reviewStage.review` is present.
- No auto-finalization occurs on the review screen.
- A later manual submit records a late `endedAt` and inflated `durationSeconds`.

## Root Cause

Entering Review & Submit loads review state and clears active question state:

- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L196>) starts the exam review transition.
- [`use-practice-session-review-stage-state.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts#L123>) stores the active exam review.
- [`use-practice-session-review-stage-state.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts#L128>) resets question state.

The page model disables the timer while review state exists:

- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L178>) computes `isTimerActive`.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L182>) requires `!reviewStage.review`, so Review & Submit turns the timer off.

The Review & Submit UI still allows a late manual submit:

- [`exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx#L238>) renders the Submit exam action.
- [`exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx#L272>) invokes `onFinalizeReview()`.
- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L238>) finalizes the exam review.

Finalization records wall-clock end time:

- [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L341) sets `endedAt = this.now()`.
- [`practice-session-summary.ts`](../../src/application/use-cases/practice-session-summary.ts#L47) computes duration from `startedAt` to that `endedAt`.

## Impact

A user who spends time on Review & Submit can end up with an exam session whose recorded `durationSeconds` exceeds the allowed exam duration, and the app does not auto-submit while the review screen is open. This is a stat-integrity issue only: the answers themselves are locked at the deadline (the server rejects all post-deadline draft saves), so scores and graded outcomes are unaffected.

## Proposed Fix

Keep the exam timer active until the exam is actually ended, including Review & Submit. Implementation options:

1. Preserve `deadlineAt` in review state and feed it to `useExamTimer` while `reviewStage.review` is active.
2. On expiry from Review & Submit, call the same finalization path used by active-question expiry.
3. Defense in depth: cap exam `endedAt`/summary duration at `computeExamDeadline(session)` during finalization, or expose a repository method that can end an expired exam at the deadline rather than at late wall-clock submit time.

## Failing Test Sketch

```tsx
it('keeps the exam timer active while the Review & Submit screen is open', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
  mockActiveTimedExam('2026-05-22T12:00:01.000Z');
  mockReviewResponse();
  mockFinalizeSummary();

  const screen = await render(<PracticeSessionPageModelReviewProbe />);
  await screen.getByRole('button', { name: 'review-answers' }).click();
  await expect.element(screen.getByTestId('active-view')).toHaveTextContent('review');

  await vi.advanceTimersByTimeAsync(1_000);

  expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
});
```

## Prior Bug Cross-Refs

- BUG-251: active exam abandon lifecycle, fixed. Not this bug.
- BUG-252: draft timing persistence, fixed. Not this bug.
- No prior bug found for timer deactivation on Review & Submit.
