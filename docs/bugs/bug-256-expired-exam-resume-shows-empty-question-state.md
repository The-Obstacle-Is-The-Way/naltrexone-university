# BUG-256: Resuming an Expired Exam Can Show "No More Questions" Instead of Results

**Status:** Open
**Severity:** P3
**Date:** 2026-06-20
**Confirmed:** 2026-06-20
**Component:** Practice Engine / Expired Exam Resume / Client State

---

## Summary

When an active exam expires while the user is away from the session page, resuming the session can finalize the exam on the server but leave the client on the generic empty-question state. The user sees "No more questions found" instead of the exam summary or post-exam review.

## Reproduction

1. Start an exam session.
2. Leave the session page or close the tab before the deadline.
3. Return after the deadline and resume the incomplete session.
4. Let the session page load.

Expected:

- The expired exam is finalized and the user lands on the summary/post-exam result surface.

Actual:

- `getNextQuestion` finalizes the expired exam and returns `null`.
- The client treats `null` as no active question and renders the generic empty state.

## Root Cause

The session page bootstraps by asking for the summary first:

- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L212>) calls `getPracticeSessionSummary`.
- If the session is not yet ended, [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L227>) falls back to `questionFlow.onTryAgain()`.

The fallback `getNextQuestion` path finalizes expired exams but returns no summary:

- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L178) checks expiry.
- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L185) executes the expired exam finalizer.
- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L186) returns `null`.
- Existing coverage starts at [`get-next-question-navigation.test.ts`](../../src/application/use-cases/get-next-question-navigation.test.ts#L306) and asserts `getNextQuestion.execute(...)` resolves to `null` at [`get-next-question-navigation.test.ts`](../../src/application/use-cases/get-next-question-navigation.test.ts#L333).

The shared load flow commits the `null` question as a ready state:

- [`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L120>) sets the loaded question to `res.data`.
- [`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L124>) marks the load as ready.

The page renders the generic no-question card:

- [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L498>) checks `loadState.status === 'ready' && props.question === null`.
- [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L500>) renders "No more questions found."

## Impact

A subscriber returning to an expired exam briefly sees an incorrect state ("No more questions found") immediately after the server finalized their exam, instead of their results. It is recoverable rather than a hard dead-end: the empty-state card renders an end-session button ([`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L501>)), and a page reload re-runs the bootstrap, which now sees the ended session and returns the summary. The harm is the confusing wrong surface on first load, not data loss — the exam is finalized correctly server-side.

## Proposed Fix

Make the expired-finalization path converge to the same result surface as normal finalization with a client-side summary recovery in the session page bootstrap fallback.

Committed path:

1. Keep `GetNextQuestionUseCase` unchanged: when an active exam is already expired, it may finalize the exam server-side and return `null`.
2. Add an optional async null-question recovery hook to the app-layer load path (`usePracticeSessionQuestionFlow` → `loadNextQuestion` → `runLoadQuestionFlow`). It must run only when the question load returns `ok(null)`, and it must run before `setQuestion(null)` / `setLoadState({ status: 'ready' })` commits the generic empty state.
3. In `usePracticeSessionPageModel`, enable that hook only for the bootstrap-summary `CONFLICT` fallback before calling `questionFlow.onTryAgain()`.
4. For that bootstrap-only `null`, immediately re-read the server-authoritative summary with `getPracticeSessionSummary({ sessionId })`.
5. If the summary read succeeds, set the page-model summary state through the same ended-session bootstrap path and reset the question state; if it still returns `CONFLICT`, preserve the existing generic no-question behavior.
6. Add a browser/page-model regression that resumes an expired exam and expects the summary view, not "No more questions found."

Rationale:

- Smallest blast radius: the fix stays in the app/page-model load orchestration and does not change domain, application use-case, controller schema, or persisted state contracts.
- Server authority is preserved: the server still performs finalization and grading; the client only re-reads the summary after that server-side state transition.
- Idempotency is preserved: the recovery adds no second finalize/end mutation, only a read after the existing expired-exam finalizer has run.
- Existing `getNextQuestion` `null` semantics remain valid for ordinary no-question states, so current application-layer navigation coverage does not need to be rewritten.

Rejected alternatives:

- Return `FinalizeExamAnswersOutput` or a new typed "finalized" union from `getNextQuestion`: broader cross-layer output/schema change for one bootstrap edge, and it weakens the stable question-load contract.
- Call `endPracticeSession` or `finalizeExamAnswers` again from the client after `getNextQuestion` returns `null`: unnecessary duplicate mutation and a larger idempotency/race surface because the reachable server path already finalized the exam.
- Render results from client-held question/load state without re-reading the summary: would trust stale/incomplete client state instead of the server-authoritative finalized session.

## Failing Test Sketch

```tsx
it('shows the summary when resuming an exam that expires during getNextQuestion', async () => {
  getPracticeSessionSummaryMock
    .mockResolvedValueOnce(errorResult('CONFLICT', 'Practice session has not ended'))
    .mockResolvedValueOnce(
      ok({
        sessionId: BROWSER_SESSION_ID,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 1200,
        },
      }),
    );
  getNextQuestionMock.mockResolvedValue(ok(null));

  const screen = await render(<PracticeSessionPageModelSummaryProbe />);

  await expect.poll(() => getPracticeSessionSummaryMock.mock.calls.length).toBe(2);
  await expect.element(screen.getByTestId('active-view')).toHaveTextContent('summary');
  await expect.element(screen.getByTestId('summary-mode')).toHaveTextContent('exam');
});
```

## Prior Bug Cross-Refs

- BUG-125: old no-more-questions dead-end, resolved. BUG-256 is the expired-exam auto-finalization variant.
- BUG-226: completed-session navigation empty-state bug, resolved. BUG-256 is a different `getNextQuestion` null source.
