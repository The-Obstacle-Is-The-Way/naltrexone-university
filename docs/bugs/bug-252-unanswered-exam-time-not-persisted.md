# BUG-252: Unanswered Exam Question Time Is Not Persisted Before Finalization

**Status:** Open — branch fix landed, pending PR review / merge / production verification
**Resolution State:** Implementation commit `902fc4d4` on branch `bug/252-persist-unanswered-exam-time` widens exam draft saves to accept `selectedChoiceId: string | null`, persists time-only unanswered drafts, and leaves `FinalizeExamAnswersUseCase` unchanged. Full local gate passed on 2026-06-19: typecheck, lint, unit 2883, browser 298, integration 112, build, and e2e 36. Keep open until PR review/merge, promotion to `main`, and production deploy READY verification are complete.
**Severity:** P3
**Date:** 2026-06-18
**Confirmed:** 2026-06-18
**Component:** Practice Engine / Exam Draft Timing / Omitted Attempts

---

## Summary

Before implementation commit `902fc4d4`, exam mode tracked per-question elapsed time locally, but if the user left a question without selecting an answer, the client intentionally skipped the server draft write. `FinalizeExamAnswersUseCase` later computed omitted attempts' `timeSpentSeconds` from server-side `draftCumulativeMs`, so unanswered questions that the user spent time on could be finalized with `timeSpentSeconds = 0`.

This does not affect scoring and no current UI surfaces omitted-question timing. Until the branch fix is reviewed, merged, promoted, and production-verified, BUG-252 remains a narrow persistence-accuracy gap in the proposed stopwatch model: unanswered time is preserved only in browser state until the user later selects an answer.

## Reproduction

1. Start a two-question exam.
2. On question 1, spend 15 seconds reading but do not choose an answer.
3. Navigate to question 2.
4. Submit the exam while question 1 remains unanswered.
5. Inspect the finalized omitted attempt for question 1.

Expected:

- Question 1 is omitted and incorrect.
- Its attempt records approximately `timeSpentSeconds = 15` because the user spent 15 seconds on that question.

Pre-fix actual:

- Question 1 is omitted and incorrect.
- Its attempt records `timeSpentSeconds = 0` because no server draft write ever persisted the local `15_000` ms.

## Root Cause

The root-cause evidence below describes the pre-fix state verified at filing. Commit `902fc4d4` changes the live branch behavior, but BUG-252 remains open until the fix is reviewed, merged/promoted, and production-verified.

The interaction-contract doc labels the stopwatch behavior as a proposed model, and that model says cumulative time should be persisted on draft save and used during finalization:

- [`interaction-contracts.md`](../practice-engine/interaction-contracts.md#L191) defines "On leave question: cumulativeMs += ...".
- [`interaction-contracts.md`](../practice-engine/interaction-contracts.md#L192) says "On draft save: persist cumulativeMs alongside the draft choiceId".
- [`interaction-contracts.md`](../practice-engine/interaction-contracts.md#L193) says "On finalize: timeSpentSeconds = Math.floor(cumulativeMs / 1000)".

The pre-fix client had an explicit no-selection early return:

- [`maybeSaveDraftBeforeNavigation`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L174>) checks `if (!input.selectedChoiceId)`.
- It calls `onSaved` with the local `cumulativeMs` at [`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L175>), but returns without calling `saveExamDraftAnswerFn` at [`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L180>).
- The existing test suite locks in that behavior: [`question-flow-actions.test.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.test.ts#L858>) asserts "tracks unanswered exam time locally" and [`question-flow-actions.test.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.test.ts#L889>) expects `saveExamDraftAnswerFn` not to be called.

The pre-fix server/API shape also prevented persisting a time-only draft:

- [`SaveExamDraftAnswerInputSchema`](../../src/adapters/controllers/practice-schemas.ts#L61) requires `selectedChoiceId: zUuid`.
- [`SaveExamDraftAnswerInput`](../../src/application/use-cases/save-exam-draft-answer.ts#L14) requires `selectedChoiceId: string`.
- [`PracticeSessionRepository.saveDraftAnswer`](../../src/application/ports/practice-session-repository.ts#L33) also requires `selectedChoiceId: string`.

Finalization then trusts the server-side draft clock for omitted attempts:

- [`FinalizeExamAnswersUseCase`](../../src/application/use-cases/finalize-exam-answers.ts#L95) loops every question state.
- It caps `state.draftCumulativeMs` and computes `timeSpentSeconds` from that value at [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L96-L100).
- For unanswered questions, it inserts the omitted attempt with that value at [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L106) and [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L112).

Before `902fc4d4`, unanswered cumulative time never left the browser until a choice was later selected, so finalization wrote an undercounted duration for questions that remained omitted.

## Impact

Exam scoring remains correct for the omitted answer, but persisted attempt timing is wrong for skipped/unanswered exam questions until the branch fix is deployed. The current user-facing impact is low because the app does not display per-question omitted timing. The durable risk is bad timing data for analytics, audits, or future study recommendations.

## Proposed Fix

Change the exam draft write contract to persist time-only drafts by allowing `selectedChoiceId: string | null` while keeping `latest*` finalized fields untouched. A narrow implementation direction:

1. Rename or widen `saveExamDraftAnswer` to accept nullable `selectedChoiceId`.
2. Validate nullable selected choice: if non-null, it must belong to the question; if null, only persist `draftCumulativeMs` and `draftSavedAt`.
3. Update the repository port and `DrizzlePracticeSessionRepository.saveDraftAnswer` to set `draftSelectedChoiceId` to the nullable value and always persist monotonic `draftCumulativeMs`.
4. Update `maybeSaveDraftBeforeNavigation` to call the server whenever cumulative time advances, even when no choice is selected.
5. Keep `FinalizeExamAnswersUseCase` reading `draftCumulativeMs`; once server truth is correct, omitted attempts get the correct duration.

Rejected alternative: store unanswered timing only in local component state or send all clocks during finalization. Local state is lost on refresh/navigation and would make finalization depend on client-supplied bulk timing instead of the existing session-state source of truth.

## Failing Test Sketch

```ts
it('persists cumulative time for unanswered exam questions before navigation', async () => {
  const saveExamDraftAnswerFn = vi.fn().mockResolvedValue(
    ok({
      questionId,
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
      draftSelectedChoiceId: null,
      draftSavedAt: '2026-06-18T12:00:00.000Z',
      draftCumulativeMs: 15_000,
    }),
  );

  const shouldNavigate = await maybeSaveDraftBeforeNavigation({
    sessionId,
    question: { questionId, session: { mode: 'exam' } },
    selectedChoiceId: null,
    currentCumulativeMs: 15_000,
    lastSavedDraftSelectedChoiceId: null,
    lastSavedDraftCumulativeMs: 0,
    saveExamDraftAnswerFn,
    setLoadState: () => {},
  });

  expect(shouldNavigate).toBe(true);
  expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
    sessionId,
    questionId,
    selectedChoiceId: null,
    cumulativeMs: 15_000,
  });
});
```

Add an application-level companion test using `FakePracticeSessionRepository`: save a nullable/time-only draft with `draftCumulativeMs: 15_000`, finalize the exam, and assert the omitted attempt for that question has `timeSpentSeconds === 15`.
