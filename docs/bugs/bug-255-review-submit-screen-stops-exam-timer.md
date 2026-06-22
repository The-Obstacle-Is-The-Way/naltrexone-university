# BUG-255: Review & Submit Screen Stops the Active Exam Timer

**Status:** Open
**Severity:** P4
**Date:** 2026-06-20
**Confirmed:** 2026-06-20
**Component:** Practice Engine / Exam Timer / Review & Submit Lifecycle

---

## Summary

The active exam timer is disabled once the user enters the Review & Submit screen. If the deadline passes while the user remains on that screen, the exam is not auto-finalized. The user can submit later, and the session `endedAt` plus `durationSeconds` are recorded from the late submit time rather than the exam deadline.

This is a timer-enforcement gap in a normal exam workflow: reviewing answers before final submit.

**Scope (why P4):** the durable effect is an inflated recorded `endedAt` and `durationSeconds`, which then display in summary/history surfaces and can affect completed-session ordering. Verified answer-mutation paths do not make this a scoring bug: draft persistence still routes through `SaveExamDraftAnswerUseCase`, which rejects post-deadline saves with `CONFLICT: Exam time has expired` ([`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts#L55)); opening a question from review returns to the active exam question UI ([`use-practice-session-review-stage-state.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts#L141>)), whose production exam action bar has navigation/review controls but no per-question submit button ([`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L350>)); and even if the synthetic probe calls the per-question submit path, `SubmitAnswerUseCase` rejects active exam sessions with `VALIDATION_ERROR` ([`submit-answer.ts`](../../src/application/use-cases/submit-answer.ts#L182)). BUG-254's finalization flush remains bounded to a single current question within `FINALIZE_FLUSH_DEADLINE_GRACE_MS` and is not a general post-deadline draft-save bypass ([`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L38)).

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

- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L204>) starts the `onEndSession` path that saves the current draft before entering review.
- [`use-practice-session-review-stage-state.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts#L160>) loads review state for exam sessions instead of immediately finalizing.
- [`use-practice-session-review-stage-state.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts#L123>) stores the active exam review.
- [`use-practice-session-review-stage-state.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts#L128>) resets question state.

The page model disables the timer while review state exists:

- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L186>) computes `isTimerActive`.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L188>) requires a current `questionFlow.sessionInfo.deadlineAt`, which review entry clears via `resetQuestionState`.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L190>) also requires `!reviewStage.review`, so Review & Submit turns the timer off even though the active exam is not ended.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L193>) is the only `useExamTimer` wiring for the session page; with `isTimerActive === false`, no expiry callback runs from the Review & Submit screen.

The Review & Submit UI still allows a late manual submit:

- [`exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx#L238>) renders the Submit exam action.
- [`exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx#L272>) invokes `onFinalizeReview()`.
- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L251>) finalizes the exam review.

Pre-fix finalization reached the session end boundary without an explicit exam deadline timestamp, so summary/history projected duration from the repository's wall-clock default:

- [`use-practice-session-review-stage.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts#L142>) calls the same `endSession(...)` helper used by finalization, but the Review & Submit path does not pass a `finalDraftAnswer`.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L252) calls `tx.sessions.end(...)`.
- [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L341) defaults to `this.now()` when callers do not provide an explicit `endedAt`.
- [`practice-session-summary.ts`](../../src/application/use-cases/practice-session-summary.ts#L47) computes duration from `startedAt` to that `endedAt`.
- [`get-session-history.ts`](../../src/application/use-cases/get-session-history.ts#L91) recomputes completed-session `durationSeconds` from persisted `startedAt`/`endedAt` for history.
- [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L142) orders completed sessions by `endedAt` descending.

## Impact

A user who spends time on Review & Submit can end up with an exam session whose recorded `durationSeconds` exceeds the allowed exam duration, and whose `endedAt` reflects when they eventually clicked Submit exam instead of when time expired. This can show an impossible duration in the summary/history UI and can make the completed session sort/date as later than the exam deadline. No score or graded-outcome impact was found in the normal Review & Submit flow: post-deadline draft saves are rejected, active-exam per-question submit is not exposed in production UI and is server-rejected, and BUG-254's final flush is a bounded expiry-only single-question path rather than a general answer map.

## Proposed Fix

**Verdict: FIX.** Accepting this as won't-fix would leave persisted exam timestamps/durations visibly impossible for a normal workflow. The harm is low, but the correct fix is small and belongs at the server-authoritative finalization boundary rather than relying on a client timer.

Committed path:

1. In `FinalizeExamAnswersUseCase`, compute the server-side exam deadline with `computeExamDeadline(session)` and choose an effective end time of `deadline === null ? now : min(now, max(deadline, latestAnsweredAt))` for active exam finalization. Manual submit before the deadline still ends at `now`; submit after the deadline ends at the deadline unless BUG-254's accepted finalization flush records an attempt inside the grace window after the deadline, in which case `endedAt` must not be earlier than that attempt's `answeredAt`.
2. Persist that effective end time through the `PracticeSessionRepository` boundary ([`practice-session-repository.ts`](../../src/application/ports/practice-session-repository.ts#L59)) instead of allowing `DrizzlePracticeSessionRepository.end(...)` to always stamp `this.now()` for exam finalization. Keep the generic tutor `EndPracticeSessionUseCase` behavior unchanged.
3. Return the summary projected from the same persisted effective `endedAt`, so `endedAt`, summary `durationSeconds`, and history `durationSeconds` share one source of truth.
4. Do not relax `SaveExamDraftAnswerUseCase` and do not broaden BUG-254's finalization flush. The cap happens after the existing `applyFinalDraftAnswer(...)` grace-window validation, so `FINALIZE_FLUSH_DEADLINE_GRACE_MS` still only controls whether the single current-question expiry flush may be accepted; when such a flush is accepted after the deadline, the persisted exam end time may extend only as far as that validated attempt's `answeredAt` so the session does not end before its own recorded attempt.

Rejected alternatives:

- **Accept as won't-fix P4:** rejected because impossible exam durations and late completion timestamps are visible and persisted, not merely transient UI copy.
- **Client-only timer restoration on Review & Submit:** rejected as the primary fix because review entry currently clears `deadlineAt`, browser timers can be throttled or clock-skewed, and a client-only change cannot guarantee the persisted `endedAt` is capped. It may be added as a UX guard later, but it must not be the source of truth.
- **Cap only the returned summary duration:** rejected because it hides one projection while leaving persisted `endedAt`, history duration, history date, and ordering inconsistent.
- **Relax post-deadline draft saves:** rejected because it would let ordinary answer changes persist after time expires and would violate the exam deadline invariant.

## Failing Test Sketch

Primary red test goes in [`finalize-exam-answers.test.ts`](../../src/application/use-cases/finalize-exam-answers.test.ts), which already uses `FakePracticeSessionRepository`, `FakeAttemptRepository`, `FakeQuestionRepository`, `createPracticeSession`, and `createQuestion`.

```ts
it('caps expired exam finalization endedAt and duration at the server deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-17T12:05:00.000Z'));

  const questions = new FakeQuestionRepository([
    createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
  ]);
  const attempts = new FakeAttemptRepository();
  const sessions = new FakePracticeSessionRepository([
    createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      startedAt: new Date('2026-03-17T12:00:00.000Z'),
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'q1-correct',
          draftSavedAt: new Date('2026-03-17T12:10:00.000Z'),
          draftCumulativeMs: 30_000,
        },
      ],
    }),
  ]);
  const useCase = new FinalizeExamAnswersUseCase(
    questions,
    attempts,
    sessions,
    passthroughTransaction(questions, attempts, sessions),
    () => new Date(),
  );

  const summary = await useCase.execute({
    userId: 'user-1',
    sessionId: 'session-1',
  });

  expect(summary.endedAt).toBe('2026-03-17T12:01:12.000Z');
  expect(summary.totals.durationSeconds).toBe(72);
  await expect(sessions.findByIdAndUserId('session-1', 'user-1')).resolves.toMatchObject({
    endedAt: new Date('2026-03-17T12:01:12.000Z'),
  });
});
```

Secondary browser coverage is feasible if the implementation also restores visible timer behavior on the Review & Submit screen: [`PracticeSessionPageModelReviewProbe`](<../../app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.probes.tsx#L181>) and the timer spec helpers in [`use-practice-session-page-model-timer.browser.spec.tsx`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx#L28>) already exist. Do not make that browser test the only proof; the persisted end-time invariant belongs in the use-case/repository tests.

## Prior Bug Cross-Refs

- BUG-251: active exam abandon lifecycle, fixed. Not this bug.
- BUG-252: draft timing persistence, fixed. Not this bug.
- BUG-254: expiry final draft flush, fixed. Compatible: this bug's proposed end-time cap must not widen `FINALIZE_FLUSH_DEADLINE_GRACE_MS` or accept more than the one validated current-question draft.
- BUG-237: active exam per-question submit is fixed/rejected server-side. Relevant to severity: the synthetic `allowExamCommit` probe is not a production answer-mutation path.
- No prior bug found for timer deactivation on Review & Submit.
