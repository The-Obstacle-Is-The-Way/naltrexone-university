# BUG-258: Server-Expired Draft Save Can Drop the Final Exam Selection When the Browser Clock Lags

**Status:** Open
**Severity:** P3
**Date:** 2026-06-23
**Confirmed:** 2026-06-23
**Component:** Practice Engine / Exam Clock / Draft Finalization

---

## Summary

When a user clicks **Review & Submit** or another draft-saving exam navigation control after the server-side exam deadline, the draft save can correctly return `CONFLICT: Exam time has expired`. If that user's browser clock is still behind the server deadline, the client treats the failed save as non-expiry, returns without calling `finalizeExamAnswers(finalDraftAnswer)`, and leaves the selected answer only in React state. A reload or retry then finalizes from persisted server draft state without that local selection, so the question is recorded as omitted.

This is narrower than BUG-254: timer expiry already forwards the on-screen selection to the server. BUG-258 is the manual draft-save failure path where the server has already said "expired" but the client consults `Date.now()` before sending the bounded finalization flush.

## Reachability (why P3)

Reachability is a real user path: a subscriber in an active exam selects an answer, clicks **Review & Submit** or a question navigation control after the server deadline, and has a browser clock behind the server by enough that `Date.now() < deadlineAt`. The screen **self-heals if the user simply waits**: the exam timer stays active through the save-error state — [`isTimerActive`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L186>) is not gated on the error load state — so once the browser clock crosses the deadline the timer-expiry path [`finalizeExpiredExam`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L155>) flushes the same captured selection and grades it. The **permanent-loss trigger** is a reload or route bootstrap that wipes the local React selection **before** the timer catches up: the expired-session finalizer then runs with no `finalDraftAnswer` and records the question as omitted. A plain retry without reload is not lossy on its own — the selection persists in React state and a later retry (or the self-heal) still flushes it. The clock-skew requirement bounds the harm window to the skew magnitude, so this is narrower than BUG-254 (which needed no skew and had no self-heal): P3 rather than P2.

## Reproduction

1. Start an exam session with one visible question and a server deadline of `2026-05-22T12:00:01.000Z`.
2. Keep the browser clock at `2026-05-22T12:00:00.500Z` while the server clock used by `SaveExamDraftAnswerUseCase` is already at or after `2026-05-22T12:00:01.000Z`.
3. Select a choice on the current question.
4. Click **Review & Submit**.
5. The draft save returns `CONFLICT: Exam time has expired`; the page shows an error and does not call `finalizeExamAnswers` with the captured `finalDraftAnswer`.
6. Reload the session route, or otherwise trigger the expired-session bootstrap.

Expected:

- Once the server reports that the ordinary draft save is expired, the client should send the bounded single-question final flush to `finalizeExamAnswers`; the server remains authoritative and either accepts it within `FINALIZE_FLUSH_DEADLINE_GRACE_MS` or rejects it.

Actual:

- The client uses the browser clock to decide that expiry has not happened and returns without finalizing.
- The local selection is not persisted.
- A later server-side expired-session finalization has no `finalDraftAnswer`, so the question is finalized as omitted.

## Root Cause

Active exam choice selection is local until a draft save or final flush happens:

- [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L448>) handles `onSelectChoice`.
- [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L454>) returns before `commitChoice(...)` for exam mode.
- [`saveCurrentExamDraft`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L226>) is the normal persistence path and delegates to `maybeSaveDraftBeforeNavigation`.
- [`maybeSaveDraftBeforeNavigation`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L202>) sets an error and returns `false` when the server action returns `ok:false`.

The server correctly enforces the deadline for ordinary draft saves:

- [`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts#L55) checks `isExamExpired(session, this.now())`.
- [`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts#L56) throws `CONFLICT: Exam time has expired`.

The manual review/navigation path captures the answer but then reinterprets the failed server save through the browser clock:

- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L211>) captures `finalDraftAnswer` before the save.
- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L212>) awaits `saveCurrentExamDraft()`.
- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L219>) computes `isExpired` with `Date.now() >= deadlineMs`.
- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L221>) calls `finalizeExamSession(finalDraftAnswer)` only when that browser-clock check says expired.
- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L224>) returns without finalizing when the server rejected the save but the browser clock is still behind.

The timer path cannot be the authoritative fallback under skew because it is also browser-clock driven:

- [`use-exam-timer.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L23>) computes remaining time from `Date.now()`.
- [`use-exam-timer.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L51>) fires `onExpire` only when that local computation reaches zero.

If the user reloads or otherwise triggers bootstrap before the local timer catches up, the expired-session server path finalizes without the local answer:

- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L178) detects server-side expiry.
- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L185) runs the expired-exam finalizer with only `{ userId, sessionId }`.
- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L186) returns `null` after finalization.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L190) treats a null persisted draft as unanswered.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L193) creates an omitted outcome, and [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L194) inserts the omitted attempt.

The existing browser coverage proves only the aligned/local-expired branch:

- [`use-practice-session-page-model-timer.browser.spec.tsx`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx#L162>) covers manual **Review & Submit** after a rejected draft save.
- [`use-practice-session-page-model-timer.browser.spec.tsx`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx#L177>) advances the browser clock past the deadline before clicking, so the skew branch is not covered.

## Impact

A user can permanently lose the answer they selected at the end of an exam and receive an incorrectly lower score if a server-expired draft save is followed by reload/retry before their local timer catches up.

## Proposed Fix

Thread a typed draft-save result through the app-layer exam flow and make the server error, not the browser clock, drive expiry recovery.

Committed path:

1. Change the shared exam draft save seam to preserve the failed `ActionResult` code/message instead of collapsing every failure to `false`.
2. In active-exam manual navigation/review handlers, when a draft save fails with `CONFLICT`, call `finalizeExamSession(finalDraftAnswer)` without the `Date.now() >= deadlineAt` gate.
3. Keep the existing server-side `FinalizeExamAnswersUseCase.applyFinalDraftAnswer` deadline/grace validation as the authority. If the conflict was a genuine expiry within `FINALIZE_FLUSH_DEADLINE_GRACE_MS`, the selected answer is graded. If the server says the flush is too early/late or the session is already ended, the existing `endSession` conflict recovery/error path handles it.
4. Preserve the current non-`CONFLICT` behavior: network failures, validation errors, and ordinary save failures should still show an error rather than silently finalizing.
5. Apply the same typed expiry recovery to every draft-save-before-navigation caller that can leave the current exam question, not only the **Review & Submit** button, so Next/Previous/explicit navigation cannot strand a local selection after a server-expired save.

This keeps grading server-authoritative, does not relax `SaveExamDraftAnswerUseCase`, does not widen `FINALIZE_FLUSH_DEADLINE_GRACE_MS`, and does not introduce a client-supplied answer map. The client sends only the already-bounded single current-question `finalDraftAnswer`; the server still validates ownership, session membership, choice membership, and timing.

Rejected alternatives:

- **Keep the browser-clock gate and wait for the local timer:** rejected because the server has already reported expiry, and waiting leaves the selected answer local-only and vulnerable to reload/retry.
- **Relax ordinary draft saves after expiry:** rejected because it would let users keep changing answers after the deadline and would regress the BUG-254/255 deadline invariant.
- **Finalize without `finalDraftAnswer` when the save fails:** rejected because it recreates the BUG-254 data-loss shape by omitting the selected on-screen answer.
- **Autosave every exam radio click as the primary fix:** useful defense-in-depth, but it does not solve this exact failure when the server rejects the final save as expired; the server-authoritative expiry recovery is still required.

## Failing Test Sketch

```tsx
it('finalizes with the captured draft when the server says the save is expired but the browser clock is behind', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-22T12:00:00.500Z'));
  mockActiveTimedExam('2026-05-22T12:00:01.000Z');
  mockFinalizeSummaryFromFinalFlush();
  saveExamDraftAnswerMock.mockResolvedValue(
    errorResult('CONFLICT', 'Exam time has expired'),
  );

  const screen = await render(<PracticeSessionPageModelReviewProbe />);
  await expect.element(screen.getByTestId('active-view')).toHaveTextContent('question');
  await screen.getByRole('button', { name: 'select-choice-1' }).click();

  await screen.getByRole('button', { name: 'review-answers' }).click();

  await expect.element(screen.getByTestId('active-view')).toHaveTextContent('summary');
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

Today this fails because `usePracticeSessionReviewStage` returns after the rejected save: `finalizeExamAnswersMock` is not called and the active view remains in an error state. The test should live beside the existing timer/page-model browser coverage in [`use-practice-session-page-model-timer.browser.spec.tsx`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx>).

## Prior Bug Cross-Refs

- BUG-254: fixed timer-expiry loss of a local selection with the bounded `finalDraftAnswer` flush. BUG-258 is the manual draft-save failure path that still fails to call that flush when the browser clock lags.
- BUG-255: fixed late Review & Submit duration by capping server `endedAt`; it did not make client clock checks authoritative.
- BUG-256: fixed bootstrap `ok(null)` recovery to summary; it cannot restore a local-only selection that was never sent to the server.
- BUG-257: fixed publication-state tolerance after session membership is proven; unrelated to clock skew.
