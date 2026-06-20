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

- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L204>) calls `getPracticeSessionSummary`.
- If the session is not yet ended, [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L219>) falls back to `questionFlow.onTryAgain()`.

The fallback `getNextQuestion` path finalizes expired exams but returns no summary:

- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L178) checks expiry.
- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L185) executes the expired exam finalizer.
- [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L186) returns `null`.
- Existing coverage locks this contract at [`get-next-question-navigation.test.ts`](../../src/application/use-cases/get-next-question-navigation.test.ts#L306).

The shared load flow commits the `null` question as a ready state:

- [`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L120>) sets the loaded question to `res.data`.
- [`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L124>) marks the load as ready.

The page renders the generic no-question card:

- [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L498>) checks `loadState.status === 'ready' && props.question === null`.
- [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L500>) renders "No more questions found."

## Impact

A subscriber returning to an expired exam briefly sees an incorrect state ("No more questions found") immediately after the server finalized their exam, instead of their results. It is recoverable rather than a hard dead-end: the empty-state card renders an end-session button ([`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L501>)), and a page reload re-runs the bootstrap, which now sees the ended session and returns the summary. The harm is the confusing wrong surface on first load, not data loss — the exam is finalized correctly server-side.

## Proposed Fix

Make the expired-finalization path converge to the same result surface as normal finalization.

Possible implementation:

1. Change the expired exam finalizer pathway to return `FinalizeExamAnswersOutput` or a typed "finalized" result instead of overloading `null`.
2. In the client fallback path, if `getNextQuestion` returns `null` for a session request, immediately call `getPracticeSessionSummary({ sessionId })` before rendering the empty state.
3. Add a browser/page-model regression that resumes an expired exam and expects the summary view, not "No more questions found."

## Failing Test Sketch

```tsx
it('shows the summary when resuming an exam that expires during getNextQuestion', async () => {
  getPracticeSessionSummaryMock
    .mockResolvedValueOnce(errorResult('CONFLICT', 'Practice session has not ended'))
    .mockResolvedValueOnce(ok(finalizedExamSummary));
  getNextQuestionMock.mockResolvedValue(ok(null));

  const screen = await render(<PracticeSessionPageModelReviewProbe />);

  await expect.element(screen.getByTestId('active-view')).toHaveTextContent('summary');
});
```

## Prior Bug Cross-Refs

- BUG-125: old no-more-questions dead-end, resolved. BUG-256 is the expired-exam auto-finalization variant.
- BUG-226: completed-session navigation empty-state bug, resolved. BUG-256 is a different `getNextQuestion` null source.
