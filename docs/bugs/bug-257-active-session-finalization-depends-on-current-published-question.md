# BUG-257: Active Exam Finalization Depends on Current Question Publication State

**Status:** Open
**Severity:** P4
**Date:** 2026-06-20
**Confirmed:** 2026-06-20 (mechanism only — see Reachability)
**Component:** Practice Engine / Session Snapshot Integrity / Content Publication

---

## Summary

Practice sessions store only question IDs and draft choice IDs. Draft save and finalization then refetch question data through `findPublishedById(s)`. If a question is unpublished, archived, or otherwise absent from the published-question repository after the session starts but before the user saves/finalizes, the active exam can no longer save or finalize that answered question.

Read models already tolerate unavailable questions after completion, but the write path for active sessions does not.

## Reachability (why P4, not P3)

This is a **latent robustness gap, not an in-app-reachable bug**. There is no application flow that unpublishes or deletes a published question: `QuestionRepository` exposes only reads (no `create`/`update`/`delete`/`insert`/`save`), there are no admin/content routes that mutate questions, and `questions.status` is written only via schema/migrations/seed. Triggering this requires an **out-of-band** content operation (a migration, re-seed, or manual DB edit that removes or unpublishes a question) to land **during a short, timed active exam** that already contains that question. No user action causes it. The genuine, verified observation is the read/write asymmetry — the read side tolerates missing rows with `isAvailable: false`, while the active-session write path throws `NOT_FOUND`. Tracked at P4 (hardening) until there is evidence of a content-change pathway that can actually hit an active session.

## Reproduction

1. Start an exam while question `q1` is published.
2. Select an answer for `q1` or save a draft for it.
3. Before final submit, deploy/content-change `q1` to non-published or remove it from the published repository.
4. Try to save the draft or submit the exam.

Expected:

- The active session finalizes against the question/choice snapshot that was valid when the session was created, or gracefully omits/unavailable-marks the affected row without stranding the whole session.

Actual:

- Draft save rejects with `NOT_FOUND: Question not found`.
- Finalization rejects when it cannot refetch the drafted question from the published-only repository.
- The user must abandon the exam or wait for content to be restored.

## Root Cause

The question repository only returns currently published rows:

- [`drizzle-question-repository.ts`](../../src/adapters/repositories/drizzle-question-repository.ts#L93) filters `findPublishedById` by `questions.status = 'published'`.
- [`drizzle-question-repository.ts`](../../src/adapters/repositories/drizzle-question-repository.ts#L125) does the same for `findPublishedByIds`.

Draft save depends on the current published row:

- [`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts#L59) calls `findPublishedById(input.questionId)`.
- [`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts#L61) throws `NOT_FOUND` if it is absent.
- Existing coverage asserts that missing/unpublished draft saves are rejected at [`save-exam-draft-answer.test.ts`](../../src/application/use-cases/save-exam-draft-answer.test.ts#L191).

Finalization depends on current published rows for drafted answers:

- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L87) collects drafted states.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L90) fetches those questions.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L126) reads the fetched question.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L128) throws `NOT_FOUND` when the published row is unavailable.

Completed/read-side review already has an unavailable-row model:

- [`get-practice-session-review.ts`](../../src/application/use-cases/get-practice-session-review.ts#L160) returns `isAvailable: false` rows for missing questions.
- [`get-completed-session-questions-with-feedback.ts`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L207) does the same after completion.

## Impact

If an out-of-band content operation removes/unpublishes a drafted question during an active exam (no in-app flow does this today), the user loses the ability to save or submit that in-progress exam until the content is restored. Low probability and not user-triggerable, hence P4.

## Proposed Fix

Make active sessions snapshot-safe. Good implementation options:

1. Store immutable question/choice grading snapshot data in `practice_sessions.params_json` at session start, at least `{ questionId, choiceIds, correctChoiceId }`.
2. Add a repository method for session-owned questions that can fetch by ID regardless of current publication status, and use it only for sessions that already contain the question ID.
3. For finalization, if a question is unavailable and no grading snapshot exists, finalize the affected drafted answer through a documented fallback instead of failing the whole session.
4. Keep public question browsing and new-session candidate selection restricted to published questions.

## Failing Test Sketch

```ts
it('finalizes a drafted exam answer even if the question is no longer published', async () => {
  const sessions = new FakePracticeSessionRepository([
    createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [
        createPracticeSessionQuestionState({
          questionId: 'q1',
          draftSelectedChoiceId: 'c1',
          draftCumulativeMs: 12_000,
        }),
      ],
    }),
  ]);
  const attempts = new FakeAttemptRepository();
  const questions = new FakeQuestionRepository([]);
  const useCase = new FinalizeExamAnswersUseCase(
    sessions,
    questions,
    attempts,
    writeTransaction,
  );

  await expect(
    useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
  ).resolves.toMatchObject({ sessionId: 'session-1' });
});
```

The current implementation throws `ApplicationError('NOT_FOUND', 'Question not found')`.

## Prior Bug Cross-Refs

- No prior practice-engine bug found for active-session finalization depending on current publication status.
- Existing unavailable-row behavior in completed review is related but read-only and does not fix active finalization.
