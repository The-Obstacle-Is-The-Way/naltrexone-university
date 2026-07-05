# BUG-277: Exam-Expiry Finalize Carrying a Stale Draft Flush Aborts the Entire Finalization With a Reason-less CONFLICT

**Status:** Open
**Severity:** P2
**Date:** 2026-07-05
**Confirmed:** 2026-07-05
**Component:** Practice / Exam Finalize / Conflict Contract

---

## Summary

When the exam timer fires its expiry callback, the client **always** attaches the current on-screen draft as `finalDraftAnswer` to the finalize request (the BUG-254 flush). Server-side, `applyFinalDraftAnswer` accepts that flush only inside the grace window `[deadline, deadline + 15s]` (`FINALIZE_FLUSH_DEADLINE_GRACE_MS = 15_000`) — and when the flush arrives outside the window it throws a bare, reason-less `CONFLICT` that aborts the **whole finalize transaction**, not just the flush. The same finalize without the flush would have succeeded.

The common trigger is completely ordinary user behavior: select an answer, background the tab (or sleep the laptop) across the deadline, and return more than 15 seconds later. `useExamTimer` fires `onExpire` from its `visibilitychange`/`focus` listeners on return, the flush is stale by construction, and the finalize fails. The client's CONFLICT recovery then fetches the summary of a still-unfinalized session, which throws `CONFLICT 'Practice session has not ended'` — surfaced to the user as a full-screen error stating the *opposite* of what just happened. Because both client-side guards are one-shot, the timer never re-attempts; the user recovers only via "Try Again" (whose question load auto-finalizes the expired exam server-side) or a page reload — and their at-expiry selection is dropped either way.

This is precisely the seam the DEBT-426 structured conflict-reason contract was built for (`PracticeSessionConflictReasons` + `isExamExpiryDraftSaveConflict`), and this CONFLICT carries no reason at all.

## Reachability

Any exam-mode session where the user has a selection on the current question and the tab is not foregrounded within 15 seconds of the deadline. Backgrounded tabs, laptop sleep, OS-level tab throttling, and mobile browser app-switching all land here. No unusual state required.

## Reproduction

1. Start an exam-mode session; on the current question, select a choice but do not navigate (the selection is the unsaved on-screen draft).
2. Background the tab (switch apps / minimize / let the laptop sleep) before the exam deadline.
3. Return to the tab more than 15 seconds after the deadline.

Expected: the exam finalizes; the at-expiry selection is either graded (if policy allows) or cleanly dropped; the user lands on the summary.

Actual: `useExamTimer`'s `visibilitychange`/`focus` handler fires `onExpire` → `finalizeExpiredExam` captures the draft and calls finalize with it → the server rejects the **entire finalization** (`CONFLICT 'Final exam answer flush is only allowed at exam expiry'`) → the client's CONFLICT branch fetches the summary → summary throws `CONFLICT 'Practice session has not ended'` → the user sees a full-screen error reading "Practice session has not ended" on an exam that just expired. The session remains unfinalized until the user clicks Try Again or reloads.

## Root Cause

Server — the flush check is inside the finalize transaction and aborts everything, with no reason annotation:

- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L147-L154) applies `finalDraftAnswer` via `applyFinalDraftAnswer` inside the write transaction, **before** grading.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L285-L296): outside `[deadline, deadline + FINALIZE_FLUSH_DEADLINE_GRACE_MS]` it throws `new ApplicationError('CONFLICT', 'Final exam answer flush is only allowed at exam expiry')` — no `details.reason`, and the throw propagates out of the transaction, aborting the grading that would otherwise have succeeded.

Client — the flush is unconditional and the guards are one-shot:

- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L187-L210>): `finalizeExpiredExam` sets `expiryFinalizeInFlightRef.current = true` (never reset), captures `questionFlow.getCurrentExamDraft() ?? undefined`, and always forwards it to `reviewStage.finalizeExamSession(finalDraftAnswer)`. There is no staleness check against the deadline before attaching the flush.
- [`use-exam-timer.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L58-L64>): `firedDeadlineMsRef` guarantees `onExpire` fires at most once per deadline — so a failed finalize is never retried by the timer.
- [`practice-session-page-logic.ts`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L222-L247>): the end-session CONFLICT recovery assumes CONFLICT means "already ended" and fetches the summary; [`get-practice-session-summary.ts`](../../src/application/use-cases/get-practice-session-summary.ts#L30) then throws `CONFLICT 'Practice session has not ended'`, which becomes the displayed error message.

Recovery that does exist: [`get-next-question.ts`](../../src/application/use-cases/get-next-question.ts#L178-L186) auto-finalizes an expired exam (without any flush) via `expiredExamFinalizer` on the next question load, so Try Again / reload converges. The at-expiry selection is dropped, which is the correct grace-window policy — but the path to get there is a wrong error and a dead-ended timer.

## Impact

A user who backgrounds an expiring exam sees a false full-screen error ("Practice session has not ended"), their exam stays unfinalized until they take manual action, and their last on-screen selection is silently dropped. High-stakes surface (exam mode), fully plausible trigger, misleading message. No data corruption — the server state converges once any question load runs — so P2 rather than P1.

## Proposed Fix

Two complementary layers; the first is the real fix:

1. **Server: degrade the stale flush instead of aborting the finalize.** In `applyFinalDraftAnswer`, when the flush is outside the grace window, drop the flush (log it) and continue finalizing the session — grading proceeds from persisted drafts exactly as an unflushed finalize would. A finalize request must never be worse than the same request without its optional enhancement. If rejecting the whole request is deliberately preferred, the CONFLICT must carry `details.reason` (a new `PracticeSessionConflictReasons` member, e.g. `FinalFlushOutsideGraceWindow`) so the client can retry without the flush.
2. **Client: don't attach a flush that is provably stale.** `finalizeExpiredExam` knows `deadlineAt`; when `now > deadline + FINALIZE_FLUSH_DEADLINE_GRACE_MS`, call finalize without `finalDraftAnswer`. Also reset `expiryFinalizeInFlightRef` on failure so the flow is not one-shot.

## Failing Test Sketch

```typescript
it('finalizes the session even when the final draft flush arrives after the grace window', async () => {
  // Arrange: exam session with a persisted draft on Q1, deadline in the past
  // beyond FINALIZE_FLUSH_DEADLINE_GRACE_MS relative to the injected now().
  const output = await useCase.execute({
    userId,
    sessionId,
    finalDraftAnswer: { questionId: q1, selectedChoiceId: choiceA, cumulativeMs: 1000 },
  });

  // Today: throws CONFLICT 'Final exam answer flush is only allowed at exam expiry'
  // Expected: session finalized; stale flush dropped; persisted drafts graded.
  expect(output.endedAt).not.toBeNull();
});
```

## Related

- BUG-254 (archived) introduced the grace-window flush this bug is the failure mode of.
- DEBT-426 (archived) introduced the conflict-reason contract this CONFLICT bypasses.
- [BUG-280](bug-280-double-finalize-race-maps-to-reasonless-conflict.md) — a second reason-less CONFLICT on the same finalize surface.
- [DEBT-438](../debt/debt-438-conflict-reason-client-coverage-gaps.md) — the broader reason-coverage debt this instance belongs to.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (five independent DDIA-lens reviewers; line-level verification against `e3853656`).
