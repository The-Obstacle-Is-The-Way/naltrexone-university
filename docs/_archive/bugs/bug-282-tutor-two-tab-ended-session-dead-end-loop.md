# BUG-282: Tutor Session Ended in Another Tab Leaves the Losing Tab in a Reason-less CONFLICT Dead-End Loop

**Status:** Resolved
**Severity:** P3
**Date:** 2026-07-05
**Confirmed:** 2026-07-05
**Component:** Practice / Tutor Mode / Conflict Handling

---

## Summary

The tutor-mode submit and question-load paths throw bare `ApplicationError('CONFLICT', 'Practice session already ended')` with no `details.reason`, and the client has **no** CONFLICT handling on those surfaces. When a tutor session is ended in one tab, the other tab becomes a dead end: answering a question fails with a generic error, "Try Again" reloads the question and fails with the same error, forever. Only a full page reload — whose bootstrap path *does* handle CONFLICT by fetching the summary — escapes the loop.

The recovery machinery already exists and works on the end-session surface (`CONFLICT → fetch summary → render results`); these two server paths simply never adopted the reason annotation, and these two client surfaces never adopted the recovery.

## Reachability

Any multi-tab or multi-device use of a tutor session (phone + laptop is the natural case). One side ends the session; the other side is live on a question.

## Reproduction

1. Open the same tutor session in two tabs. In tab B, end the session.
2. In tab A, click an answer choice (auto-commit fires `submitAnswer`).
3. Tab A shows a generic full-screen error. Click "Try Again" (fires `getNextQuestion`).

Expected: tab A recognizes the session ended and shows the session summary — exactly what the end-session surface and the bootstrap path already do on CONFLICT.

Actual: step 2 fails (`submit-answer` CONFLICT), step 3 fails (`get-next-question` CONFLICT), and the loop repeats indefinitely. The raw server message is shown; nothing refetches session state; only a manual reload recovers.

## Root Cause

Server — reason-less CONFLICTs:

- [`submit-answer.ts`](../../../src/application/use-cases/submit-answer.ts#L189-L191): `if (session && session.endedAt !== null) throw new ApplicationError('CONFLICT', 'Practice session already ended')` — no `details`.
- [`get-next-question.ts`](../../../src/application/use-cases/get-next-question.ts#L175-L177): same shape on session load.

Both predate the DEBT-426 conflict-reason contract and were never annotated with `practiceSessionAlreadyEndedError()` (which exists in `src/application/errors` and carries `details.reason = AlreadyEnded`).

Client — no recovery on these surfaces:

- [`question-flow-actions.ts`](<../../../app/(app)/app/practice/shared/question-flow-actions.ts#L330-L335>): `runSubmitAnswerFlow` funnels any failure into a generic error state; no CONFLICT branch.
- [`question-flow-actions.ts`](<../../../app/(app)/app/practice/shared/question-flow-actions.ts#L131-L142>): the question-load path likewise treats any non-ok result, including CONFLICT, as a generic load error. Contrast [`practice-session-page-logic.ts`](<../../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L222-L247>) (end surface: CONFLICT → summary fetch → results) and the bootstrap summary path in `use-practice-session-page-model.ts`, which is why a reload works.

## Impact

Multi-tab tutor users hit an unexplained, unrecoverable-in-place error loop. No data is at risk (the session is genuinely ended; every write is correctly refused), so P3 — but the failure mode is the exact one the reason contract was designed to make graceful, on the product's most-used practice mode.

## Proposed Fix

1. Server: replace both bare throws with `practiceSessionAlreadyEndedError()` so the CONFLICT carries `AlreadyEnded`.
2. Client: on submit/load CONFLICT with reason `AlreadyEnded`, reuse the existing summary-recovery (fetch summary, render results) instead of the generic error state. A private reason extractor (`getActionResultPracticeSessionConflictReason`) already exists in `question-flow-actions.ts`; use or generalize that instead of matching messages.

Keep the fail-safe default: CONFLICT without a recognized reason continues to the generic error state.

## Failing Test Sketch

```typescript
it('annotates the ended-session submit conflict with AlreadyEnded', async () => {
  const error = await submitAnswerUseCase
    .execute({ userId, sessionId: endedSessionId, questionId, selectedChoiceId })
    .catch((e) => e);

  expect(error.code).toBe('CONFLICT');
  // Today: details is undefined.
  expect(error.details?.reason).toBe(PracticeSessionConflictReasons.AlreadyEnded);
});
```

Plus a browser-mode spec pinning that a submit CONFLICT with `AlreadyEnded` transitions the session view to the summary instead of `loadState: 'error'`.

## Resolution

Resolved by PR #563 (squash `a3be3330`) and promoted to production by PR #564 (merge commit `4e923359dfd391206baf6887f3ab4a1e470e3152`).

The fix replaced the bare ended-session CONFLICTs on submit/load with `practiceSessionAlreadyEndedError()` and taught the tutor question-flow client to recover recognized `AlreadyEnded` conflicts by fetching and rendering the session summary. Reason-less conflicts still use the generic fail-safe error path.

## Verification

- Fix PR: #563, squash `a3be3330`.
- Promotion PR: #564, merge commit `4e923359dfd391206baf6887f3ab4a1e470e3152`.
- Production deploy: GitHub deployment `5331520979`, Vercel target `https://naltrexone-university-cosiyzvs9-john-h-jungs-projects.vercel.app`, succeeded 2026-07-06T15:13:34Z.
- Health proof: `https://addictionboards.com/` and the Vercel deployment URL both returned HTTP/2 200 after the promo; Vercel runtime logs for the checked deployment window contained only the two successful HEAD requests and no errors.

## Related

- DEBT-426 (archived) — the conflict-reason contract these paths predate.
- [DEBT-438](../../debt/debt-438-conflict-reason-client-coverage-gaps.md) — umbrella coverage debt (this bug is its highest-value concrete instance).
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (five independent DDIA-lens reviewers; line-level verification against `e3853656`).
