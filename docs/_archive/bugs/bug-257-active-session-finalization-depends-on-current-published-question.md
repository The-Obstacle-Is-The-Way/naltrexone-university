# BUG-257: Active Exam Finalization Depends on Current Question Publication State

**Status:** Resolved
**Severity:** P4
**Date:** 2026-06-20
**Confirmed:** 2026-06-20 (mechanism only — see Reachability)
**Component:** Practice Engine / Session Snapshot Integrity / Content Publication
**Resolution:** Fixed via PR #494 (squash `de29bf32` on `dev`; CodeRabbit went `CHANGES_REQUESTED` → `APPROVED` on the exact head `08f947dd`, 0 unresolved threads, "No actionable comments generated") → promoted to `main` via PR #495 (merge `8acc2964`; required `test` check green; the promo tree was byte-identical to the CR-approved #494 head and was merged under an owner-authorized override of CodeRabbit's review-rate-limit cooldown). Production deploy `6kHUtCD6ZT3JZ3n6Fi4j36n81WTv` verified READY 2026-06-23 (addictionboards.com HTTP 200); `main` and `dev` trees identical. Shipped the committed path below: session-scoped, publication-agnostic `QuestionRepository.findByIdForSession`/`findByIdsForSession` reads used only after session ownership is proven (membership gate in `SaveExamDraftAnswerUseCase` before the non-public lookup; finalize grades drafted state via `fetch-session-owned-questions-by-id.ts`; the BUG-254 flush validates via `findByIdForSession`); public browsing and candidate selection stay published-only. The Root Cause and Current Fix Seams citations below reflect the shipped (post-fix) line numbers.

---

## Summary

Practice sessions store only question IDs and draft choice IDs. Before the fix on PR #494, draft save and finalization refetched question data through `findPublishedById(s)`. If a question was unpublished, archived, or otherwise absent from the published-question repository after the session started but before the user saved/finalized, the active exam could no longer save or finalize that answered question.

Read models already tolerate unavailable questions after completion. PR #494 brings active-session write paths into alignment by using session-owned question lookups after membership is proven.

## Reachability (why P4, not P3)

This is a **latent robustness gap, not an in-app-reachable bug**. There is no application flow that unpublishes or deletes a published question: `QuestionRepository` exposes only reads (no `create`/`update`/`delete`/`insert`/`save`), there are no admin/content routes that mutate questions, and database writes to question publication state are limited to schema/migrations/seed tooling. Triggering this requires an **out-of-band** content operation (a migration, re-seed, seed archiving, or manual DB edit that removes a question from the published set) to land **during a short, timed active exam** that already contains that question. No user action causes it. The genuine, verified observation is the read/write asymmetry — the read side tolerates missing rows with `isAvailable: false`, while the active-session write path throws `NOT_FOUND`. Tracked at P4 (hardening) until there is evidence of a content-change pathway that can actually hit an active session.

## Reproduction

1. Start an exam while question `q1` is published.
2. Select an answer for `q1` or save a draft for it.
3. Before final submit, deploy/content-change `q1` to non-published or remove it from the published repository.
4. Try to save the draft or submit the exam.

Expected:

- The active session finalizes against session-owned question/choice data even if the question is no longer publicly published, without stranding the whole session solely because publication status changed.

Actual before PR #494:

- Draft save rejects with `NOT_FOUND: Question not found`.
- Finalization rejects when it cannot refetch the drafted question from the published-only repository.
- The user must abandon the exam or wait for content to be restored.

## Root Cause and Current Fix Seams

The public question repository methods intentionally return only currently published rows:

- [`drizzle-question-repository.ts`](../../../src/adapters/repositories/drizzle-question-repository.ts#L107) filters `findPublishedById` by `questions.status = 'published'`.
- [`drizzle-question-repository.ts`](../../../src/adapters/repositories/drizzle-question-repository.ts#L131) does the same for `findPublishedByIds`.

Before the fix, active-session write paths reused those public reads. Current PR #494 seams:

- [`save-exam-draft-answer.ts`](../../../src/application/use-cases/save-exam-draft-answer.ts#L59) proves `input.questionId` is in the loaded session before the non-public lookup.
- [`save-exam-draft-answer.ts`](../../../src/application/use-cases/save-exam-draft-answer.ts#L66) calls `findByIdForSession(input.questionId)` after that membership gate.
- Coverage accepts session-owned archived questions at [`save-exam-draft-answer.test.ts`](../../../src/application/use-cases/save-exam-draft-answer.test.ts#L156), rejects archived questions outside the session at [`save-exam-draft-answer.test.ts`](../../../src/application/use-cases/save-exam-draft-answer.test.ts#L192), and still rejects genuinely missing session-owned rows at [`save-exam-draft-answer.test.ts`](../../../src/application/use-cases/save-exam-draft-answer.test.ts#L262).

Finalization now uses session-owned reads for drafted answers:

- [`finalize-exam-answers.ts`](../../../src/application/use-cases/finalize-exam-answers.ts#L173) collects drafted states.
- [`finalize-exam-answers.ts`](../../../src/application/use-cases/finalize-exam-answers.ts#L176) fetches those questions through [`fetchSessionOwnedQuestionsById`](../../../src/application/shared/fetch-session-owned-questions-by-id.ts#L4), which calls `findByIdsForSession`.
- [`finalize-exam-answers.ts`](../../../src/application/use-cases/finalize-exam-answers.ts#L216) reads the fetched question.
- [`finalize-exam-answers.ts`](../../../src/application/use-cases/finalize-exam-answers.ts#L218) still throws `NOT_FOUND` only if the session-owned row is genuinely absent.
- The BUG-254 final on-screen draft flush uses the same session-owned boundary: [`applyFinalDraftAnswer`](../../../src/application/use-cases/finalize-exam-answers.ts#L296) validates the flushed question through `findByIdForSession`, and [`finalize-exam-answers.ts`](../../../src/application/use-cases/finalize-exam-answers.ts#L300) throws `NOT_FOUND` only if that session-owned row is genuinely absent.

Completed/read-side review already has an unavailable-row model:

- [`get-practice-session-review.ts`](../../../src/application/use-cases/get-practice-session-review.ts#L161) returns `isAvailable: false` rows for missing questions.
- [`get-completed-session-questions-with-feedback.ts`](../../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L208) does the same after completion.

## Impact

If an out-of-band content operation removes a drafted question from the published set during an active exam (no in-app flow does this today), the user loses the ability to save or submit that in-progress exam until the content is restored. Low probability and not user-triggerable, hence P4.

## Proposed Fix

Make active-session writes publication-state tolerant without relaxing public question discovery. Add a `QuestionRepository` method for session-owned question lookup that fetches by ID regardless of current `questions.status`, and use it only after the loaded practice session proves the `questionId` is already part of that session. Thread that method through `SaveExamDraftAnswerUseCase`, `FinalizeExamAnswersUseCase` drafted-state grading, and the BUG-254 `finalDraftAnswer` flush validation; keep public browsing, standalone question loading, and new-session candidate selection on the existing `findPublished*`/`listPublishedCandidateIds` methods.

This is the smallest sound Clean Architecture change for the verified mechanism. `practice_sessions.params_json` already exists, but today it stores only filters, ordered `questionIds`, and mutable question state; adding grading snapshots would require extending the strict params schema and changing session creation to fetch/store choice/correct-answer data that finalization can already obtain from the persisted question rows. Finalization needs the full question choices to validate membership and `gradeAnswer(question, selectedChoiceId)`, and archived/unpublished rows still satisfy the existing attempts/choices foreign keys, so a session-scoped non-public read fixes the published-state dependency while preserving the published-only boundary for user-facing discovery.

Rejected alternatives:

- **Snapshot grading data in `params_json`:** robust but more invasive than necessary for this P4 because session creation currently selects only IDs and params parsing is strict.
- **Relax `findPublishedById(s)` globally:** would leak archived/draft questions into browsing and candidate selection.
- **Finalize missing rows through a fallback without fetching question data:** prevents stranding only by giving up grading; keep it as a later hard-delete fallback if product wants to tolerate actual row deletion.
- **Do nothing / accept:** low reachability, but a small port-level hardening keeps active sessions independent of later publication-state flips.

## Failing Test Sketch

```ts
it('finalizes a drafted exam answer even if the question is no longer published', async () => {
  const archivedQuestion = createQuestion({
    id: 'q1',
    status: 'archived',
    choices: [
      createChoice({ id: 'c1', questionId: 'q1', label: 'A', isCorrect: true }),
      createChoice({ id: 'c2', questionId: 'q1', label: 'B', sortOrder: 2 }),
    ],
  });
  const sessions = new FakePracticeSessionRepository([
    createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'c1',
          draftSavedAt: null,
          draftCumulativeMs: 12_000,
        },
      ],
    }),
  ]);
  const attempts = new FakeAttemptRepository();
  const questions = new FakeQuestionRepository([archivedQuestion]);
  const writeTransaction = passthroughTransaction(questions, attempts, sessions);
  const useCase = new FinalizeExamAnswersUseCase(
    questions,
    attempts,
    sessions,
    writeTransaction,
  );

  await expect(
    useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
  ).resolves.toMatchObject({ sessionId: 'session-1' });
});
```

The pre-fix implementation threw `ApplicationError('NOT_FOUND', 'Question not found')` because `FakeQuestionRepository.findPublishedByIds` filtered out the archived question. PR #494's concrete regression test uses the existing `passthroughTransaction(questions, attempts, sessions)` helper shape from `finalize-exam-answers.test.ts`.

## Prior Bug Cross-Refs

- No prior practice-engine bug found for active-session finalization depending on current publication status.
- Existing unavailable-row behavior in completed review is related but read-only and does not fix active finalization.
