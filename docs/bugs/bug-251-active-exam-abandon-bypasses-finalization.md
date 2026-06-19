# BUG-251: Active Exam Abandon Completes Without Finalization

**Status:** Fix implemented on `dev` (PR #464) — pending promotion to `main` + production verification before archival
**Severity:** P2
**Date:** 2026-06-18
**Confirmed:** 2026-06-18
**Component:** Practice Engine / Exam Lifecycle / Session Abandon

---

## Summary

An in-progress exam session can be "abandoned" from the Practice page, but the abandon path calls the generic `endPracticeSession` action. That action marks the active exam as completed without running `finalizeExamAnswers`, so no final attempts are created for drafted or omitted answers.

The exam is no longer active after this write, so this is not an active-exam secrecy leak under the canonical `mode === 'exam' && endedAt === null` policy. It is still a real lifecycle/data-integrity bug: UI copy promises to discard the in-progress session, but the system persists it as a completed reviewable exam with missing finalized attempts and dropped drafts.

## Reproduction

1. Start an exam session with at least one question.
2. Leave `/app/practice/[sessionId]` and return to `/app/practice` while the exam is still incomplete.
3. On the incomplete-session card, click **Abandon session** and confirm **Abandon anyway**.
4. The UI calls `endPracticeSession({ sessionId, idempotencyKey: sessionId })` instead of `finalizeExamAnswers`.
5. Open History → Sessions, expand the abandoned exam, or click the session row's review link.

Expected:

- An active exam cannot become a completed/reviewable session through the generic abandon path.
- Either the exam is discarded in a non-reviewable state, or it is explicitly submitted through `finalizeExamAnswers`.

Actual:

- The active exam receives `endedAt` with no finalization.
- Completed-session feedback treats the abandoned exam as reviewable because the only review gate is `session.endedAt !== null`.
- History may show the exam as `0/N` or undercount answered/omitted questions because final attempts were never created.

## Root Cause

The incomplete-session abandon UI is mode-agnostic:

- [`IncompleteSessionCard`](<../../app/(app)/app/practice/components/incomplete-session-card.tsx#L26>) renders the card for both exam and tutor sessions.
- [`IncompleteSessionCard`](<../../app/(app)/app/practice/components/incomplete-session-card.tsx#L46>) exposes **Abandon session** for every incomplete session.
- [`abandonIncompleteSession`](<../../app/(app)/app/practice/practice-page-incomplete-session.ts#L77>) calls the supplied `endPracticeSessionFn` with only `sessionId` and `idempotencyKey`.

The server action and use case do not distinguish tutor end from exam finalization:

- [`EndPracticeSessionInputSchema`](../../src/adapters/controllers/practice-schemas.ts#L47) accepts only `sessionId` and optional `idempotencyKey`; it has no mode or intent.
- [`endPracticeSession`](../../src/adapters/controllers/practice-controller.ts#L244) directly calls `endPracticeSessionUseCase.execute(...)`.
- [`EndPracticeSessionUseCase.execute`](../../src/application/use-cases/end-practice-session.ts#L21) directly calls `sessions.end(...)`; it does not reject active exam sessions or finalize drafts.
- [`DrizzlePracticeSessionRepository.end`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L319) only sets `endedAt` when it is currently null.

After that write, completed-session feedback trusts `endedAt` as the reveal boundary:

- [`GetCompletedSessionQuestionsWithFeedbackUseCase.execute`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L100) only rejects sessions whose `endedAt` is null.
- The same use case then returns answer-key fields at [`correctChoiceId`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L195), [`explanationMd`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L196), and [`choiceExplanations`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L198).
- History links completed sessions to review routes at [`history-sessions-tab.tsx`](<../../app/(app)/app/history/components/history-sessions-tab.tsx#L172>) and renders the breakdown at [`history-sessions-tab.tsx`](<../../app/(app)/app/history/components/history-sessions-tab.tsx#L275>).

## Impact

This is a specific-flow lifecycle bug. A subscriber can turn an in-progress exam into a completed reviewable session through a UI action labeled as discard, and the resulting completed session has no finalized exam attempts. The user cannot peek and then submit the same exam later because `finalizeExamAnswers` rejects already-ended sessions, and overall attempt-based stats are not inflated. The harm is misleading session history/review state and loss of the drafted/omitted finalization record.

## Proposed Fix

**Decision (2026-06-18, owner-approved): exam "Abandon" means TRUE DISCARD by deletion.**

"Abandon" on an in-progress exam means *discard it as if it never happened* — matching the dialog copy ("This will discard the in-progress session and you will need to start over"). The owner confirmed there is **no need to retain or measure exam abandonment**, so the abandoned exam session is **hard-deleted**, not tombstoned. Deletion is chosen because it adds **no new lifecycle state** — and "a reader forgot to exclude a session state" is exactly this bug's failure mode, so introducing an `abandoned` state would re-create the bug class elsewhere. The discarded data is uncommitted exam drafts (an active exam has zero finalized attempts) — the lowest-value data in the system. If abandonment analytics are ever needed, a retain-and-hide model can be added then.

Implementation (exam-specific):

1. Add `DiscardPracticeSessionUseCase` + a `discardPracticeSession` server action that **deletes** the caller's incomplete session: `DELETE WHERE id = ? AND user_id = ? AND ended_at IS NULL`. Idempotent — a missing/already-discarded session resolves success (the abandon UI passes an idempotency key and may retry). Deletion frees the `PRACTICE_SESSIONS_USER_INCOMPLETE_UQ` partial unique index so the user can start a new session immediately.
2. Guard `EndPracticeSessionUseCase` (defense in depth): reject `mode === 'exam' && endedAt === null` with `VALIDATION_ERROR`, so no caller can complete an active exam through the generic end path.
3. Route the Practice-hub abandon to the new discard action for **exam** sessions. **Tutor** abandon is unchanged: tutor sessions accrue real graded attempts as they are answered, so `end()` legitimately completes them, and tutor mode has no answer secrecy.

Rejected alternatives:

- **Reject-only guard (no discard action):** would strand the user behind the one-incomplete-session constraint — they could neither end the exam nor start a new one. Kept only as defense-in-depth *alongside* the discard action, never alone.
- **Auto-finalize on abandon (route to `finalizeExamAnswers`):** silently submits and grades drafts the user chose to throw away, contradicting the "discard" copy. If the product ever wants abandon-means-submit, re-label the dialog first; do not finalize under discard wording.
- **Soft-delete / `abandoned_at` tombstone:** preserves an abandonment signal the owner does not want, and adds an `abandoned` state every lifecycle reader (history, completed-feedback, incomplete, stats) must remember to exclude — re-creating this bug's class. Over-engineered for the present need.

## Failing Test Sketch

```ts
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { EndPracticeSessionUseCase } from './end-practice-session';

it('rejects generic end for an active exam session', async () => {
  const sessions = new FakePracticeSessionRepository([
    createPracticeSession({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'exam',
      endedAt: null,
      questionIds: ['33333333-3333-4333-8333-333333333333'],
      questionStates: [
        createPracticeSessionQuestionState({
          questionId: '33333333-3333-4333-8333-333333333333',
          draftSelectedChoiceId: null,
          draftCumulativeMs: 15_000,
        }),
      ],
    }),
  ]);
  const useCase = new EndPracticeSessionUseCase(sessions);

  await expect(
    useCase.execute({
      userId: '22222222-2222-4222-8222-222222222222',
      sessionId: '11111111-1111-4111-8111-111111111111',
    }),
  ).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  });
});
```

An integration-level regression should also assert that an active exam abandoned from the Practice page cannot make `getCompletedSessionQuestionsWithFeedback({ sessionId })` return `correctChoiceId` or explanations unless `finalizeExamAnswers` has run and created final attempts.
